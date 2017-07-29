import winston = require("winston")

import { Device, NodeList } from "../../storage.js";
import os = require("../../../../common/utils/os.js");


import { cloudSendDataAmqp } from "../../ws/cloud_client.js";
import fs = require("fs");
import neigh = require("../../neighbors.js");
import Tesseract = require("tesseract.js");
import * as itf from "../../../../common/interfaces.d"
import { algoRoundRobin } from "./algo_round_robin"
import { algoTopsis } from "./algo_topsis"
//define array to store neighbors
import MA = require('moving-average');
var ma = MA(5 * 1000); // 5sec
let msgCountCloud = 1;
let msgCountNeigh = 1;
let msgCountLocal = 1;
export function getProcessedMsgCount() {
  return [msgCountLocal, msgCountNeigh, msgCountCloud];
}
export function offload(globalCtx) {
  var seneca = this;
  //Plugin Init. Called when plugin is used for first time
  //plugin name (i.e function name or return string) and init: 'plugin name' should be same
  seneca.add({ init: "offload" }, function (msg, done) {
    // do stuff, e.g.
    setTimeout(function () {
      winston.info(" OFFload Service init done!");
      done();
    }, 1000);
  });

  this.add({ role: "offloadRequest", cmd: "taskScheduler" }, function (
    message: itf.i_edge_req,
    done
  ) {
    //execute taks locally only
    let num: number = Math.floor(Math.random() * 3);
    message.ttl = message.ttl - 1;
    winston.silly("Message ttl is ", message.ttl);
    if (message.task_id == 1 || message.task_id == 3) {
      message.payload = message.payload + ' E(' + process.env.IP_ADDR + ')';
    }
    //ttl expired -> process locally
    if (message.ttl <= 0) {
      let dict = {
        1: "Task3",
        2: "visionTask1",
        3: "stressTask"
      }
      msgCountLocal++;
      seneca.act(
        { role: "visionRequest", cmd: dict[message.task_id] },
        message,
        function (err, reply: itf.i_edge_rsp) {
          done(null, reply);
        }
      );
    } else {
      algoTopsis((rsp) => {
        num = rsp.offloadTo
        // if (neigh.Neighbors.getInstance().getActiveNeighborCount() == 2) {
        //   num = 2;
        // }
        //num = 1;
        //    switch (++options.counter % 3) {
        if (num > 1) {
          winston.debug("Msg Rcvd: offload to neighbor");
          msgCountNeigh++;
          //message.payload = message.payload + ' E(' + os.getIpAddr().split(".")[3] + ')';
          let neighborCount = neigh.Neighbors.getInstance().getAllNeighbor().length;
          //message.payload = message.payload + ' N ';
          console.log(neigh.Neighbors.getInstance().getAllNeighbor()[num - 2].ipAddr);
          //neigh.Neighbors.getInstance().getAllNeighbor()[0].test();
          //correct ctx in neighborsenddata since called from neighbor class
          neigh.Neighbors.getInstance().getAllNeighbor()[num - 2].neighborSendDataAmqp(message, function (result: itf.i_edge_rsp) {
            done(null, result);
          });
          // for (let curNeigh of neigh.Neighbors.getInstance().getAllNeighbor()) {
          //   curNeigh.neighborSendDataAmqp(message, function (result: itf.i_edge_rsp) {
          //     done(null, result);
          //   });
          // }
          // if (typeof neigh.Neighbors.getInstance().getAllNeighbor() !== null) {
          //   neigh.Neighbors.getInstance().getAllNeighbor()[0].neighborSendData(message, function (result: itf.i_edge_rsp) {
          //     //result is without command id
          //     console.error("result is --> ", result);
          //     done(null, result);
          //   });
          // }
        }
        // case 0:
        if (num == 0) {
          winston.debug("Msg Rcvd: no offload");
          msgCountLocal++;
          //console.log("executing task locally with " + message);
          // seneca.act({ role: 'offloadRequest', cmd: 'visionTask' }, message, function (err, reply) { //message.msg is image/txt
          //     //console.log(reply.result);
          //     done(null, reply)
          // })
          //if queue is empty, run the task now otherwise enque in queue
          let dict = {
            1: "Task3",
            2: "visionTask1",
            3: "stressTask"
          }
          seneca.act(
            { role: "visionRequest", cmd: dict[message.task_id] },
            message,
            function (err, reply: itf.i_edge_rsp) {
              done(null, reply);
            }
          );

        }
        if (num == 1) {
          winston.debug("Msg Rcvd: offload to cloud");
          msgCountCloud++;
          //onCloud
          //if(options.globalCtx.isCloudAlive === true){}
          cloudSendDataAmqp(message, globalCtx, function (result: itf.i_edge_rsp) {
            //console.log("Msg replied from cloud" + result);
            done(null, result);
          });
        }

      });
    }
  });

  return "offload";
};
