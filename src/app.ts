import { config } from "dotenv";
const path = require('path');
// console.log(path.join(__dirname, '../.env'));
// const replace = require('replace-in-file');
// const options = {
//   files: path.join(__dirname, '../.env'),
//   from: [/^lat.*\n/gm,
//     /^lon.*\n/gm,
//     //    /^EDGE_PORT.*\n/gm,
//     /^sessionID.*\n/gm
//   ],
//   to: ['lat=' + (Math.random() * 10 + 20) + '\n',
//   'lon=' + (Math.random() * 10 + 20) + '\n',
//   //  'EDGE_PORT=' + Math.floor(Math.random() * 30 + 9082) + '\n',
//   'sessionID=' + Math.floor(Math.random() * 1000) + '\n'
//   ],
//   allowEmptyPaths: false,
//   encoding: 'utf8',
// };
// try {
//   let changedFiles = replace.sync(options);
//   console.log('Modified files:', changedFiles.join(', '));
// }
// catch (error) {
//   console.error('Error occurred:', error);
// }


//config({ path: "../.env" });
config({ path: path.join(__dirname, '../../../.env') });
import winston = require("winston")
winston.remove(winston.transports.Console);
winston.add(winston.transports.Console, {
  timestamp: true,
  level: process.env.LOGGING_LVL, //{ error: 0, warn: 1, info: 2, verbose: 3, debug: 4, silly: 5 }
  colorize: true
});
winston.info("Edge port is " + process.env.EDGE_PORT);
//const easyMonitor = require("easy-monitor");
//easyMonitor("edgeNode");

if (!process.env.UUID) {
  process.env.UUID = require("uuid/v4")();
  winston.info("New UUID for edge is " + process.env.UUID);
}

import { cleandb } from "./storage.js";
cleandb();
import { startOSMonitoring } from "./../../common/utils/os";
//import { startMonitoringQueueStats } from "./../../common/utils/ms_stats";

import { startCharting } from "./charts/server"

import mdns = require("mdns");
import Chairo = require("chairo");
import Hapi = require("hapi");
import { edgeStartConsuming, establishRMBLocalConnection, startPublishingLocalTopics } from "./ws/edge_server.js"

//import rest_routes = require("./api.js");

const server = new Hapi.Server();
server.connection({
  host: process.env.REST_HOST,
  port: process.env.REST_PORT
});
import { startAnnouncements } from "./mDNS.js";
import rest_service = require("./plugins/rest/service.js");
import core_service = require("./plugins/core/service.js");
import offload_service = require("./plugins/offload/service.js");
import { algoTopsisInit } from "./plugins/offload/algo_topsis";
import rest_api = require('./plugins/rest/api.js');
import vision_api = require('./plugins/vision/api.js');
import vision_service = require("./plugins/vision/service.js");
import neighbor_service = require("./neighbors.js");
import { establishRMBCloudConnection, webSocketCloudConn, subscribeCloudTopics, cloudRMQRspQSetup } from "./ws/cloud_client.js"; //executing constructor

var globalCtx: any = {};

// Register plugin
server.register({ register: Chairo, options: { timeout: 10 * 60 * 1000 } }, function (err) {
  // Add a Seneca action

  let id = 0;
  server.seneca.add({ generate: "id" }, function (message, next) {

    return next(null, { id: ++id });
  });

  // Invoke a Seneca action

  server.seneca.act({ generate: "id" }, function (err, result) {
    // result: { id: 1 }
  });

  //var edge_server = require("./ws/edge_server.js").edge_init(server.seneca); //executing constructor

  // Register all microservices plugins with seneca object
  server.seneca.use(rest_service.rest, {});
  globalCtx.counter = 0;
  globalCtx.seneca = server.seneca
  globalCtx.cloudInitDone = false;
  server.seneca.use(core_service.core, globalCtx);
  server.seneca.use(offload_service.offload, globalCtx);
  server.seneca.use(vision_service.vision, globalCtx);
  //server.seneca.use(neighbor_service.neighbors, globalCtx);

  //This maps all HTTP methods against microservices
  //server.route(rest_routes);
  server.route(rest_api);
  server.route(vision_api);
  function startLocal() {
    return new Promise(function (resolve, reject) {
      startOSMonitoring(); //nearly synchronous

      establishRMBLocalConnection()
        .then((res) => {
          startPublishingLocalTopics();
          //d_task1_req queue needs to be asserter before starting monitoring
          //startMonitoringQueueStats('d_task1_req'); //assume synchronous
          winston.info("Local setup done");
          resolve();
        })
        .catch((err) => {
          winston.error(err);
          reject(err);
        })
    });
  }
  //startLocal();
  function startCloud() {
    return new Promise(function (resolve, reject) {
      establishRMBCloudConnection()
        .then((res) => {
          return Promise.all([subscribeCloudTopics(), cloudRMQRspQSetup()])
        })
        .then(() => {
          return algoTopsisInit();
        })
        .then(() => {
          winston.info("Cloud Ready!!")
          resolve();
        })
        .catch((err) => {
          winston.error(err);
          reject(err);
        });
    })
  };


  //startCloud();

  function startSenecaServer() {
    return new Promise(function (resolve, reject) {
      // start the server
      server.start(function (err) {
        if (err) throw err;
        winston.info("Seneca Server is running at", server.info.uri);
        //startAnnouncements();

        // start cloud client and edge server after middleware is initialized
        //here cloud init used to be

        //.then(cloud_client.registerServices)
        resolve();
      });
    });
  }
  Promise.all([startSenecaServer(), startCloud(), startLocal()])
    .then((values) => {
      edgeStartConsuming(server.seneca);
      //startCharting();
    });
  //establish websocket connection to cloud
  webSocketCloudConn();
});


function local() {
  this.add("cmd:run", function (msg, done) {
    return done(null, { tag: "local" });
  });
}
