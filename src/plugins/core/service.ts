//core.js

import { Device } from "../../storage.js";
import { NodeList } from "../../storage.js";

//import { cpuPercent, freeMem } from "../../../../common/utils/os.js";
import { cloudSendDataAmqp } from "../../ws/cloud_client.js";
import fs = require("fs");

import Tesseract = require("tesseract.js");
import Config from "../../config";

export function core(globalCtx) {
  var seneca = this;
  //Plugin Init. Called when plugin is used for first time
  //plugin name (i.e function name or return string) and init: 'plugin name' should be same
  seneca.add({ init: "core" }, function (msg, done) {
    setTimeout(function () {
      console.log(" Core service init done!");
      done();
    }, 1000);
  });

  this.add({ role: "coreRequest", cmd: "getDevicesList" }, function (msg, done) {
    Device.find({ isActive: true }, function (err, results) {
      console.log(results);
    });
    done(null, { result: "CORE SERVICE: dev1, dev2, dev3" });
  });

  this.add({ role: "coreRequest", cmd: "registerDevice" }, function (msg, done) {
    console.log("msg is " + msg.isActive);
    var cats = [];
    //cats.push(category1, category2);
    if (msg.categories == "IOT") console.log("new device registered");
    else console.log("error");
    var newDevice = new Device({
      deviceId: msg.deviceId,
      description: msg.description,
      type: msg.type,
      categories: cats //new subCategory({name: "IOT", typeNo: "1"})
    });
    newDevice.save(function (err, result) {
      if (err) throw err;
      console.log(result);
    });
    done(null, {
      id: newDevice.id,
      result: "CORE SERVICE: new device"
    });
  });

  this.add({ role: "coreRequest", cmd: "deleteDevice" }, function (msg, done) {
    Device.remove({ _id: msg.id }, function (err) {
      console.log(err);
    });
    Device.findByIdAndRemove(msg.id, function (err) {
      console.log(err);
    });
    done(null, { result: "CORE SERVICE: device deleted" });
  });

  this.add({ role: "coreRequest", cmd: "postDataPoint" }, function (msg, done) {
    Device.findOne({ _id: msg.id }, function (err, doc) {
      console.log(doc);
    });
    Device.findById(msg.id, function (err, doc) {
      console.log(doc);
    });
    done(null, { result: "CORE SERVICE: device posted a datapoint" });
  });

  this.add({ role: "coreRequest", cmd: "postDataToDevice" }, function (
    msg,
    done
  ) {
    Device.update({ _id: msg.id }, { description: msg.description }, function (
      err,
      numberAffected,
      rawResponse
    ) {
      console.log(numberAffected);
    });
    Device.findByIdAndUpdate(msg.id, { description: msg.description }, function (
      err,
      numberAffected,
      rawResponse
    ) {
      console.log(numberAffected);
    });
    done(null, { result: "CORE SERVICE: data to device through MQTT or WS" });
  });

  this.add({ role: "coreRequest", cmd: "getInfo" }, function (msg, done) {
    console.log("getInfo core request reached");
    var result;
    NodeList.findOne({ uuid: Config.UUID }, function (err, doc) {
      if (err) console.error(err);
      result = {
        ipAddr: doc.ipAddr,
        services: doc.services
      };
    });
    done(null, result);
  });

  this.add({ role: "coreRequest", cmd: "getDataPoints" }, function (msg, done) {
    done(null, { result: "CORE SERVICE: data to device through MQTT or WS" });
  });
  this.add({ role: "coreRequest", cmd: "taskScheduler" }, function (
    message,
    done
  ) {
    //check for tasklist and available resources
    // decide to schedule task locally or on cloud
    // if locally --> call another core service to execute task (vision)
    // if on cloud --> call remote offload core service

    //execute taks locally only
    if (++globalCtx.counter % 3 != 0) {
      //console.log("executing task locally with " + message);
      // seneca.act({ role: 'coreRequest', cmd: 'visionTask' }, message, function (err, reply) { //message.msg is image/txt
      //     //console.log(reply.result);
      //     done(null, reply)
      // })
      //if queue is empty, run the task now otherwise enque in queue
      console.error("exec locally");
      seneca.act(
        { role: "visionRequest", cmd: "visionTask1" },
        message,
        function (err, reply) {
          //message.msg is image/txt
          //console.log(reply.result);
          console.error("got reply");
          done(null, reply);
        }
      );
    } else {
      console.error("exec on cloud");
      //onCloud
      // cloudSendDataAmqp(message, function (result) {
      //   // options.cloud_client.cloudSendData(message, function (result) {
      //   //message.msg is image/txt
      //   //console.log("Msg replied from cloud" + result);
      //   done(null, { result: result });
      // });
    }
  });

  return "core";
};
