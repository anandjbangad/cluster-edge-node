import neigh = require("../../neighbors.js");
import { getCldTopics } from "../../ws/cloud_client"
import { noOfActiveCtx, getNodeMsgLatency } from "../../ws/edge_server"
import * as itf from "../../../../cluster-common/common/interfaces"
import * as os from "../../../../cluster-common/common/utils/os"
import * as amqpStats from "../../../../cluster-common/common/utils/ms_stats"
import math = require('mathjs');
import amqp = require('amqplib');
import winston = require("winston")

let amqpPython: any = {};
let socketQueueId: number = 0;
let socketQueue: any = {};
export function algoTopsisInit() {
    return new Promise(function (resolve, reject) {
        //amqp.connect('amqp://localhost') //cloud url TODO
        amqp.connect('amqp://' + process.env.PYTHON_HOST) //cloud url TODO
            .then((conn) => {
                return conn.createChannel();
            })
            .then((ch) => {
                amqpPython.ch = ch;
                winston.info("RMQ python connection established");
                return amqpPython.ch.assertQueue(process.env.UUID + 'python_rsp', { durable: false });

            })
            .then((q) => {
                amqpPython.rspQ = q.queue;
                return amqpPython.ch.assertQueue('python_req', { durable: false });

            })
            .then((q) => {

                return amqpPython.ch.consume(amqpPython.rspQ, (msg) => {
                    winston.debug("-->python recvd: [x] %s", msg.content.toString());
                    //check correlation-id from map
                    let python_msg: itf.i_python_rsp = JSON.parse(msg.content);
                    if (
                        typeof msg.properties.correlationId != "undefined" &&
                        typeof socketQueue["i_" + msg.properties.correlationId] == "function"
                    ) {
                        let execFunc = socketQueue["i_" + msg.properties.correlationId];
                        // update moving avg
                        //maNeighMsgLatency.push(Date.now(), Date.now() - (socketQueue["i_" + msg.properties.correlationId]).sendTime);
                        execFunc(python_msg);
                        delete socketQueue["i_" + msg.properties.correlationId]; // to free up memory.. and it is IMPORTANT thanks  Le Droid for the reminder
                        return;
                    } else {
                        winston.warn("Unknown response on python_rsp queue", python_msg.offloadTo);
                    }
                }, { noAck: true });

            })
            .then((q) => {
                resolve();
            })
            .catch((err) => {
                winston.err(err);
                reject(err);
            })
    });
}

var lastMsgSentTo: number = 0;
//debug = function () { }

export function algoTopsis(onReturnFunction) {
    return new Promise(function (resolve, reject) {
        socketQueueId++;
        if (typeof onReturnFunction == "function") {
            // the 'i_' prefix is a good way to force string indices, believe me you'll want that in case your server side doesn't care and mixes both like PHP might do
            socketQueue["i_" + socketQueueId] = onReturnFunction;
        }
        let noOfNeigh = neigh.Neighbors.getInstance().getActiveNeighborCount(); //getAllNeighbor().length;
        let jsonData: itf.i_python_req = {
            type: "neighmsg" + ' E(' + process.env.IP_ADDR + ')',
            payload: "mypayload",
            matrix: createArray(noOfNeigh),
            n_alternatives: 2 + noOfNeigh,
            m_criterias: 4
        };

        try {
            amqpPython.ch.sendToQueue('python_req', Buffer.from(JSON.stringify(jsonData)),
                {
                    correlationId: socketQueueId.toString(),
                    replyTo: amqpPython.rspQ
                });
        } catch (e) {
            winston.error("Sending failed to pyhon_req Queue ... .disconnected failed");
        }

    });
}
function createArray(noOfNeigh: number) {
    let dataset: number[] = [];
    //local
    dataset.push(os.getCPUNow(), os.getFreeRam(), getNodeMsgLatency(), noOfActiveCtx());
    //cloud
    let cldTopicRsp: itf.cld_publish_topics = getCldTopics();
    dataset.push(cldTopicRsp.cpu, cldTopicRsp.freemem, cldTopicRsp.jobLatency, cldTopicRsp.activeCtx)

    for (let i = 0; i != noOfNeigh; ++i) {
        dataset.push(neigh.Neighbors.getInstance().getAllNeighbor()[i].amqpNeigh.topicsUpdateMsg.cpu);
        dataset.push(neigh.Neighbors.getInstance().getAllNeighbor()[i].amqpNeigh.topicsUpdateMsg.freemem)
        dataset.push(neigh.Neighbors.getInstance().getAllNeighbor()[i].amqpNeigh.topicsUpdateMsg.jobLatency);
        dataset.push(neigh.Neighbors.getInstance().getAllNeighbor()[i].amqpNeigh.topicsUpdateMsg.activeCtx);
    }
    return dataset;
}
export function algoTopsisLocal() {
    const m_alternatives = 2 + neigh.Neighbors.getInstance().getAllNeighbor().length;
    const n_criterias = 3;
    var dataset = math.matrix(math.zeros([n_criterias, m_alternatives]));
    //fill first 2 colms
    dataset.forEach(function (value, index, matrix) {
        switch (index[1]) {
            case 0: //local
                switch (index[0]) {
                    case 0: //memory
                        dataset.subset(math.index(index[0], index[1]), os.getFreeRam());
                        break;
                    case 1: //cpu
                        dataset.subset(math.index(index[0], index[1]), os.getCPUNow());
                        break;
                    case 2: //queued msgs
                        dataset.subset(math.index(index[0], index[1]), amqpStats.getQueueStats("d_task1_req").messages || 1);
                        break;
                    default:
                        winston.error("Unknown criteria in topsis algorithm for local");
                }
                break;
            case 1: //cloud
                let cldTopicRsp: itf.cld_publish_topics = getCldTopics();
                switch (index[0]) {
                    case 0: //memory
                        dataset.subset(math.index(index[0], index[1]), cldTopicRsp.freemem);
                        break;
                    case 1: //cpu
                        dataset.subset(math.index(index[0], index[1]), cldTopicRsp.cpu);
                        break;
                    case 2: //messages
                        dataset.subset(math.index(index[0], index[1]), cldTopicRsp.jobLatency);
                        break;
                    default:
                        winston.error("Unknown criteria in topsis algorithm for cloud");
                }
                break;
            default: //neigh
                switch (index[0]) {
                    case 0: //memory
                        dataset.subset(math.index(index[0], index[1]), neigh.Neighbors.getInstance().getAllNeighbor()[index[1] - 1].amqpNeigh.topicsUpdateMsg.freemem);
                        break;
                    case 1: //cpu
                        dataset.subset(math.index(index[0], index[1]), neigh.Neighbors.getInstance().getAllNeighbor()[index[1] - 1].amqpNeigh.topicsUpdateMsg.cpu);
                        break;
                    case 2:
                        dataset.subset(math.index(index[0], index[1]), neigh.Neighbors.getInstance().getAllNeighbor()[index[1] - 1].amqpNeigh.topicsUpdateMsg.jobLatency);
                        break;
                    default:
                        winston.error("Unknown criteria in topsis algorithm for neighbor");
                }
                break;
        }
        // //neighbors
        // let votes = math.squeeze(matrix.subset(math.index(index[0], index[1], math.range(0, 3))));

        // weights.subset(math.index(index[0], index[1]), math.sum(votes) / votes.size()[0]);
    });

    //fill other colms
    // var dataset = math.matrix([
    //     [[6, 2, 4], [5, 2, 2], [1, 1, 1]],      //criteria X
    //     [[8, 8, 5], [6, 2, 4], [3, 2, 4]],  //criteria X
    //     [[4, 2, 3], [9, 9, 3], [9, 9, 9]],  //criteria X
    //     [[4, 5, 6], [2, 1, 3], [10, 10, 7]]  //criteria X
    // ]);
    // debug("Dataset is");
    print(dataset, "silly");
    // math.size() ==> rows, cols, ...
    var weights = math.zeros(dataset.size()[0], dataset.size()[1]);
    //weights(nxm)
    var criterions = weights.clone();

    var sumMinMaxDiff = math.zeros(weights.size()[1], 2); //cols =2 fixed
    // sumMinMaxDiff(mx2)
    //var minMaxDiff = sumMinMaxDiff.clone();

    var final = math.zeros(sumMinMaxDiff.size()[0]); // cols = 2 fixed
    //final(1xm)

    // dataset.forEach(function (value, index, matrix) {
    //     debug('value:', value, 'index:', index);
    //     let votes = math.squeeze(matrix.subset(math.index(index[0], index[1], math.range(0, 3))));

    //     weights.subset(math.index(index[0], index[1]), math.sum(votes) / votes.size()[0]);
    // });
    winston.silly("Weights is");
    weights = dataset.clone();
    print(weights, "silly");
    weights.forEach(function (value, index, matrix) {
        let rowSum = math.sum(matrix.subset(
            math.index(index[0], math.range(0, m_alternatives))
        ));
        criterions.subset(math.index(index[0], index[1]), Math.pow(value, 2) / rowSum);
    });
    winston.silly("Criterions is");
    print(criterions, "silly");
    for (let n = 0; n != n_criterias; n++) {
        let votes = math.squeeze(criterions.subset(math.index(n, math.range(0, m_alternatives))));
        //print(votes);
        let minVal = 0, maxVal = 0;
        //for each alternative
        for (let m = 0; m != m_alternatives; m++) {
            var value = votes.subset(math.index(m));
            //votes.forEach(function (value, index, matrix) {
            //debug(Math.pow(value - math.min(votes), 2));
            sumMinMaxDiff.subset(math.index(m, 0), Math.pow(value - math.min(votes), 2) + sumMinMaxDiff.subset(math.index(m, 0)));
            //minVal += Math.pow(value - math.min(matrix), 2);
            sumMinMaxDiff.subset(math.index(m, 1), Math.pow(math.max(votes) - value, 2) + sumMinMaxDiff.subset(math.index(m, 1)));
            //maxVal += Math.pow(math.max(matrix) - value, 2);
        }
        //sumMinMaxDiff.subset(math.index(n, 0), minVal);
        //sumMinMaxDiff.subset(math.index(n, 1), maxVal);
    }
    winston.silly("sumMinMaxDiff is");
    print(sumMinMaxDiff, "silly");
    var minMaxDiff = sumMinMaxDiff.map(function (value, index, matrix) {
        return Math.sqrt(value);
    })

    for (let m = 0; m != m_alternatives; ++m) {
        let votes = math.squeeze(minMaxDiff.subset(math.index(m, math.range(0, 2))));
        //debug(m);
        final.subset(math.index(m), votes.subset(math.index(0)) / math.sum(votes));
    }
    winston.debug("Final is");
    print(final, "debug");
    let maxVal = 0; //doubt
    let maxIdx = 0;
    final.forEach(function (value, index, matrix) {
        if (value > maxVal) {
            maxIdx = index[0];
        }
    });
    return maxIdx;

}
/**
     * Helper function to output a value in the console. Value will be formatted.
     * @param {*} value
     */
function print(value, loglvl) {
    var precision = 14;
    winston[loglvl](math.format(value, precision));
}