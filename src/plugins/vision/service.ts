import fs = require('fs');
import Tesseract = require('tesseract.js')
import os = require("../../../../cluster-common/common/utils/os");
import * as itf from "../../../../cluster-common/common/interfaces"
let exec = require('child_process').exec;
import winston = require("winston")
export function vision(globalCtx) {
    var seneca = this;
    //Plugin Init. Called when plugin is used for first time
    //plugin name (i.e function name or return string) and init: 'plugin name' should be same
    seneca.add({ init: 'vision' }, function (msg, done) {
        // do stuff, e.g.
        setTimeout(function () {
            console.log(' vision api service init done!')
            done()
        }, 1000)
    });

    this.add({ role: 'visionRequest', cmd: 'visionTask1' }, function (message, done) {
        //execute vision task locally
        //console.log("visionTask: " + message.msg);
        winston.debug("vision Request test............");

        //console.log('CLOUD Server: %s', data['json_data']);
        var base64Image = message.payload;
        var decodedImage = new Buffer(base64Image, 'base64');
        //fs.writeFile('image_decoded.png', decodedImage, function (err) { });
        Tesseract.recognize(decodedImage)
            .then(txtdata => {
                console.log('Recognized Text: ', txtdata.text);
                let rsp: itf.i_edge_rsp = {
                    type: message.type,
                    result: txtdata.text,
                    cmd_id: message.cmd_id,
                    task_id: message.task_id,
                    ttl: message.ttl,   //ttl already reduces in offload module
                    sentTime: message.sentTime
                }
                done(null, rsp)
            })
            .catch(err => {
                console.log('catch: ', err);
                let rsp: itf.i_edge_rsp = {
                    type: message.type,
                    //result: message.payload + ' E(' + os.getIpAddr().split(".")[3] + ')',
                    result: "Error Error!!",
                    cmd_id: message.cmd_id,
                    task_id: message.task_id,
                    ttl: message.ttl,   //ttl already reduces in offload module
                    sentTime: message.sentTime
                }
                done(null, rsp)
            })
            .finally(e => {
                //console.log('finally\n');
                //process.exit();
            });
        //done(null, { result: 'result for ' + message.msg.replace(/^\D+/g, '') }) //message.msg is image/text
    });
    this.add({ role: 'visionRequest', cmd: 'stressTask' }, function (message: itf.i_edge_req, done) {
        winston.silly("Stress task entered");
        let rsp: itf.i_edge_rsp = {
            type: message.type,
            //result: message.payload + ' sE(' + Config.IP_ADDR + ')',
            result: message.payload,
            cmd_id: message.cmd_id,
            task_id: message.task_id,
            ttl: message.ttl,   //ttl already reduces in offload module
            sentTime: message.sentTime
        }
        exec("stress-ng --cpu 1 --cpu-ops 90", function (error, stdout, stderr) {
            if (error !== null) {
                console.log('exec error: ' + error);
            } else {
                done(null, rsp);
            }
        });
    });
    this.add({ role: 'visionRequest', cmd: 'Task3' }, function (message: itf.i_edge_req, done) {
        let rsp: itf.i_edge_rsp = {
            type: message.type,
            //result: message.payload + ' E(' + Config.IP_ADDR + ')',
            result: message.payload,
            cmd_id: message.cmd_id,
            task_id: message.task_id,
            ttl: message.ttl,   //ttl already reduces in offload module
            sentTime: message.sentTime
        }
        //takes .5sec to complete task
        setTimeout(() => {
            done(null, rsp);
        }, 500)
    });
    return 'vision';
}