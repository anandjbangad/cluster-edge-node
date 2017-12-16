import { Neighbors } from "../neighbors"
import * as itf from '../../../cluster-common/common/interfaces'
import * as os from '../../../cluster-common/common/utils/os'
//import * as amqpStats from '../../../common/utils/ms_stats'
import amqp = require('amqplib');
import winston = require("winston")
import MA = require('moving-average');
import { startCharting } from "../charts/server"
import Config from "../config";

let reqCounter: number = 0;
let rspCounter: number = 0;
let maNodeLatency = MA(10 * 1000); // 10 sec
export function noOfActiveCtx(): number {
  return reqCounter - rspCounter;
}
let myNeighbors = Neighbors.getInstance();
let amqpLocal: any = {};
interface deviceClient {
  ipAddr: string;
  port: number;
}
let clientList: deviceClient[];
var msg_count = 0;
export function getNodeMsgLatency() {
  return maNodeLatency.movingAverage() || 0;
}

function onMessage(seneca, json_message) {
  winston.debug('---->New Msg/Req received on EDGE Server AMQP', ++msg_count, rspCounter);
  reqCounter++;
  let startTime = Date.now();
  let message: any = JSON.parse(json_message.content);
  if (message.type == "startChart") {
    startCharting();
    return;
  }
  let msg: itf.i_edge_req;
  if (typeof (message["cmd_id"]) === "undefined") { //from device layer
    msg = {
      payload: message.payload,
      cmd_id: 0,
      type: message.type,
      ttl: message.ttl,
      task_id: message.task_id,
      sentTime: message.sentTime
    };
  } else { //from neighboring node
    msg = {
      payload: message.payload,
      cmd_id: message.cmd_id,
      type: message.type,
      ttl: message.ttl,
      task_id: message.task_id,
      sentTime: message.sentTime
    };
  }

  seneca.act({ role: "offloadRequest", cmd: "taskScheduler" }, msg, (
    err,
    reply: itf.i_edge_rsp
  ) => {
    //console.error("got reply on edge_server..ready to send" + reply.result);
    // if future seperate internal and external rsp
    let json_message_out: itf.i_edge_rsp = {
      result: reply.result,
      type: "result",
      task_id: reply.task_id,
      ttl: reply.ttl,
      cmd_id: reply.cmd_id,
      sentTime: message.sentTime
    };

    if (typeof json_message.properties.replyTo !== 'undefined') {
      amqpLocal.ch.sendToQueue(json_message.properties.replyTo, Buffer.from(JSON.stringify(json_message_out)), {
        correlationId: json_message.properties.correlationId
      });
    } else {
      amqpLocal.ch.sendToQueue('d_task1_rsp', Buffer.from(JSON.stringify(json_message_out)));
    }
    rspCounter++;
    maNodeLatency.push(Date.now(), Date.now() - startTime);
  });
}
export function establishRMBLocalConnection() {
  return new Promise(function (resolve, reject) {
    amqp.connect('amqp://localhost')
      .then((conn) => {
        return conn.createChannel();
      })
      .then((ch) => {
        amqpLocal.ch = ch;
        winston.info("RMQ local connection established");
      })
      .then((ch) => {
        amqpLocal.ch.assertQueue('d_task1_req', { durable: false });
        resolve();
      })
      .catch((err) => {
        console.log(err);
        reject(err);
      })
  });
}
export function edgeStartConsuming(seneca) {
  winston.info("starting consuming traffic!")
  //var jwt = require("jsonwebtoken");

  //start consuming rabbitmq server
  amqpLocal.ch.assertQueue('d_task1_rsp', { durable: false })
    .then(() => {
      var q = 'd_task1_req';
      return amqpLocal.ch.assertQueue(q, { durable: false });
    }).then((q) => {
      amqpLocal.ch.consume(q.queue, (msg) => {
        onMessage(seneca, msg);
      }, { noAck: true })
    })
    .catch((err) => {
      console.log(err);
    })
};
export function startPublishingLocalTopics() {
  winston.info("starting publishing on local topics");
  var ex = "os_env";
  amqpLocal.ch.assertExchange(ex, 'fanout', { durable: false });
  setInterval(() => {
    let msg: itf.cld_publish_topics = {
      cpu: os.getCPUNow(),
      freemem: os.getFreeRam(),
      jobLatency: maNodeLatency.movingAverage() || 1,
      //msgCount: amqpStats.getQueueStats('d_task1_req').messages,
      activeCtx: reqCounter - rspCounter
    }
    //ch.publish(ex, '', msg);
    amqpLocal.ch.publish(ex, '', new Buffer(JSON.stringify(msg)));
    winston.verbose("Local Topic Publish ", msg);
  }, Config.localTopicPublishPeriod);
}
interface NeighborNode {
  ipAddr: string;
  ws: Object;
}
var neighborList: NeighborNode[];