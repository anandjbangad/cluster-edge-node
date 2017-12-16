import neigh = require("../neighbors.js");
import os = require("../../../cluster-common/common/utils/os")
import WebSocket = require("ws");
import ipaddr = require('ipaddr.js');
import * as itf from "../../../cluster-common/common/interfaces"
import amqp = require('amqplib');
import MA = require('moving-average');
import SA = require('simple-average');
import winston = require("winston")
import Config from "../config";

let cloudTopicRsp: itf.cld_publish_topics = {
  cpu: 0,
  freemem: 0,
  jobLatency: 1,
  activeCtx: 0
};

let maCldMsgLatency = MA(10 * 1000); // 10 sec
let maCldMsgLatencyAvg = SA(); // 20 mins
let maCldCPU = MA(5 * 1000); // 5sec
let maCldfreemem = MA(5 * 1000); // 5sec
let maCldMsgCount = MA(5 * 1000); // 5sec
let socketQueueId: number = 0;
let socketQueue: any = {};

let cloud_ws;
// function subscribeCloud() {
//   this.amqpNeigh.ch.assertExchange(this.amqpNeigh.exchange.name, 'fanout', { durable: false });
// }
export function getCldMsgLatency() {
  return [maCldMsgLatency.movingAverage(), maCldMsgLatencyAvg.avg];
}
export function getCldTopics(): itf.cld_publish_topics {
  return cloudTopicRsp;
}
let amqpCloud: any = {};
export function establishRMBCloudConnection() {
  return new Promise(function (resolve, reject) {
    amqp.connect('amqp://' + Config.CLOUD_HOST) //cloud url TODO
      .then((conn) => {
        return conn.createChannel();
      })
      .then((ch) => {
        amqpCloud.ch = ch;
        winston.info("RMQ cloud connection established");
        resolve();
      })
      .catch((err) => {
        console.log(err);
        reject(err);
      })
  });
}
export function subscribeCloudTopics() {
  return new Promise(function (resolve, reject) {
    //pub sub
    winston.info("subscribing to cloud topics!")
    amqpCloud.topicExchangeName = "os_env_cloud"
    amqpCloud.ch.assertExchange(amqpCloud.topicExchangeName, 'fanout', { durable: false })
      .then(() => {
        return amqpCloud.ch.assertQueue('', { exclusive: true });
      })
      .then((q) => {
        amqpCloud.topicRspQ = q.queue;
        amqpCloud.ch.bindQueue(amqpCloud.topicRspQ, amqpCloud.topicExchangeName, '');
      })
      .then((q) => {
        return amqpCloud.ch.consume(amqpCloud.topicRspQ, function (msg) {
          winston.verbose("pubsub_ from cloud: [x] %o", JSON.parse(msg.content));
          cloudTopicRsp = JSON.parse(msg.content);
        }, { noAck: true });
      })
      .then(() => {
        resolve();
      })
      .catch((err) => {
        winston.error(err);
        reject();
      })
  });
}
export function cloudRMQRspQSetup() {
  return new Promise(function (resolve, reject) {
    amqpCloud.ch.assertQueue("c_task1_req", { durable: false })
      .then((q) => {
        amqpCloud.sendReqQ = q.queue;
        // setInterval(() => {
        //   debug("trying to send to cld");
        //   globalCtx.amqpCloud.ch.sendToQueue("c_task1_req", Buffer.from("sidd"));
        // }, 400);
        return amqpCloud.ch.assertQueue(Config.UUID + '_cld', { durable: false });
      })
      .then((q) => {
        amqpCloud.rspQ = q.queue;
        return amqpCloud.ch.consume(amqpCloud.rspQ, (msg) => {
          //check correlation-id from map
          let cld_msg: itf.i_edge_rsp = JSON.parse(msg.content);
          if (
            typeof msg.properties.correlationId != "undefined" &&
            typeof socketQueue["i_" + msg.properties.correlationId] == "object"
          ) {
            let execFunc = (socketQueue["i_" + msg.properties.correlationId]).retFunc;
            // update moving avg
            maCldMsgLatency.push(Date.now(), Date.now() - (socketQueue["i_" + msg.properties.correlationId]).sendTime);
            maCldMsgLatencyAvg.add(Date.now() - (socketQueue["i_" + msg.properties.correlationId]).sendTime);
            //call callback
            execFunc(cld_msg);
            delete socketQueue["i_" + msg.properties.correlationId]; // to free up memory.. and it is IMPORTANT thanks  Le Droid for the reminder
            return;
          } else {
            winston.error("Error: socketRecieveData", cld_msg.result);
          }
        }, { noAck: true })
      })
      .then(() => {
        resolve();
      })
      .catch((err) => {
        winston.error(err);
        reject();
      })
  });
}
export function init(globalCtx) {
  winston.info("Cloud Client init!");
}
export function webSocketCloudConn() {
  return new Promise(function (resolve, reject) {
    //imported from core module
    try {
      cloud_ws = new WebSocket("ws://" + Config.CLOUD_HOST + ":" + Config.CLOUD_PORT); //force new connection
    } catch (e) {
      winston.error(e);
    }
    //var ws = new WebSocket('ws://localhost:8083');

    cloud_ws.on("open", function open() {
      winston.info("WS Connection Established to cloud");
      //update uuid with cloud
      // var ipAddr = ipaddr.parse(this.url.split(":")[1].replace(/\//g, ''));
      // console.error("ipaddr is ", ipAddr);
      // os.setIpAddr(ipAddr);
      let json_message: itf.cld_edge_init = {
        type: "init",
        uuid: Config.UUID,
        sessionID: Config.sessionID
      }
      cloud_ws.send(
        JSON.stringify(json_message)
      );

      //ws.send(array, { binary: true, mask: true });
    });
    cloud_ws.onerror = function (event) {
      winston.error("Error in cloud client on Edge");
    }
    cloud_ws.on("close", function close() {
      winston.error("connection closed to cloud");
      //reconnect
      //setTimeout(function () { init(globalCtx) }, 5000);
    });

    cloud_ws.on("message", function (message, flags) {
      // flags.binary will be set if a binary data is received.
      // flags.masked will be set if the data was masked.
      let data;
      try {
        data = JSON.parse(message);
      } catch (error) {
        winston.error("socket parse error: " + data["result"]);
      }
      if (typeof data["type"] == "undefined") {
        console.error("type field is undefined");
        return;
      }
      winston.verbose("-->Msg Rcvd: " + data["type"]);
      switch (data["type"]) {
          case "initDone":
          var step;
          let services: string[] = [];
        //  for (step = 1; step <= Config.SERVICES_SUPPORT_COUNT; step++) {
            console.log(process.env.SERVICE_1);
            services.push(Config.SERVICE_1);
            services.push(Config.SERVICE_2);
              services.push(Config.SERVICE_3);
              //services.push(eval("process.env.SERVICE_" + step));
        //  }
          registerServices(services);
          break;

        case "servicesDone":
          winston.verbose("serviceDone ipaddr is ", data.ipAddr);
          os.setIpAddr(data.ipAddr);
          //send upto 5 neighbouring devices' uuid
          getNeighbours();
          break;
        case "getNeighboursDone":
          winston.info(data["neighbors"]);
          winston.info(data["ipAddr"]);
          //store neighbors list
          neigh.Neighbors.getInstance().updateNeighbors(data["neighbors"]);
          resolve(true); //resolving promise after all msg exchanges
          break;
        default:
          winston.error("Unknown Msg type received");
      }
    });
  });
}
export function cloudSendDataAmqp(data, globalCtx, onReturnFunction) {
  socketQueueId++;
  if (typeof onReturnFunction == "function") {
    // the 'i_' prefix is a good way to force string indices, believe me you'll want that in case your server side doesn't care and mixes both like PHP might do
    socketQueue["i_" + socketQueueId] = {
      "retFunc": onReturnFunction,
      "sendTime": Date.now()
    };
  }
  let jsonData: itf.i_edge_req = {
    type: "msg",
    cmd_id: socketQueueId,
    payload: data.payload,
    task_id: data.task_id,
    ttl: data.ttl,
    sentTime: data.sentTime
  };
  try {
    amqpCloud.ch.assertQueue(amqpCloud.sendReqQ, { durable: false });
    amqpCloud.ch.sendToQueue(amqpCloud.sendReqQ, Buffer.from(JSON.stringify(jsonData)),
      {
        correlationId: socketQueueId.toString(),
        replyTo: amqpCloud.rspQ
      });
  } catch (e) {
    winston.error("Sending to Cloud failed ... .disconnected failed");
  }
  //});
}
export function getNeighbours() {
  return new Promise(function (resolve, reject) {
    //send upto 5 neighbouring devices' uuid
    let json_message: itf.cld_edge_getNeighbors = {
      type: "getNeighbours",
      uuid: Config.UUID,
      sessionID: Config.sessionID,
      count: Config.neighborClusterCount
    };
    cloud_ws.send(
      JSON.stringify(json_message)
    );
  });
}
export function registerServices(services) {
  return new Promise(function (resolve, reject) {
    //register ~3 services
    let json_message: itf.cld_edge_services = {
      type: "services",
      uuid: Config.UUID,
      sessionID: Config.sessionID,
      services: services,
      gps: {
        // lat: Math.random() * 50 + 20,
        // lon: Math.random() * 50 + 20
        lat: Config.lat,
        lon: Config.lon
      }
    }
    cloud_ws.send(
      JSON.stringify(json_message)
    );
  });
}

