import ping = require('ping');
import WebSocket = require('ws');
import ipaddr = require('ipaddr.js');
import * as itf from "../../cluster-common/common/interfaces"
import amqp = require('amqplib');
import MA = require('moving-average');

import winston = require("winston")

export class gps {
    lat: Number;
    lon: Number;
    constructor(lat, lon) {
        this.lat = lat;
        this.lon = lon;
    }
    toString() {
        return "lat:" + this.lat + " lon:" + this.lon;
    }
}
export class Neighbor {
    gps: gps;
    ipAddr: String;
    services: String[];
    socketQueueId: number;
    socketQueue: any;
    amqpNeigh: any;
    maNeighMsgLatency: any;
    isReady: boolean;

    constructor(gps, ipAddr) {
        this.isReady = false;
        this.maNeighMsgLatency = MA(5 * 1000); // 5sec
        this.amqpNeigh = {};
        this.amqpNeigh.topicsUpdateMsg = <itf.cld_publish_topics>{
            cpu: 0,
            freemem: 0,
            jobLatency: 1,
            activeCtx: 0
        };
        this.socketQueueId = 0;
        this.socketQueue = {};
        this.gps = gps;
        this.ipAddr = ipAddr;
        //establish rabbitmq connection
        winston.info("Neighbor: tyring to connect to ", 'amqp://' + ipaddr.process(ipAddr))
        amqp.connect('amqp://' + ipaddr.process(ipAddr))
            .then((conn) => {
                return conn.createChannel();
            })
            .then((ch) => {
                this.amqpNeigh.ch = ch;
                return ch.assertQueue('d_task1_req', { durable: false });
            })
            .then((q) => {
                this.amqpNeigh.sendReqQ = q.queue;
                return this.amqpNeigh.ch.assertQueue(process.env.UUID + '_neigh', { durable: false });
            })
            .then((q) => {
                this.amqpNeigh.rspQ = q.queue;
                return this.amqpNeigh.ch.consume(this.amqpNeigh.rspQ, (msg) => {
                    winston.verbose("-->neigh recvd: [x] %s", msg.content.toString());
                    //check correlation-id from map
                    let neigh_msg: itf.i_edge_rsp = JSON.parse(msg.content);
                    if (
                        typeof msg.properties.correlationId != "undefined" &&
                        typeof this.socketQueue["i_" + msg.properties.correlationId] == "object"
                    ) {
                        let execFunc = this.socketQueue["i_" + msg.properties.correlationId].retFunc;
                        // update moving avg
                        this.maNeighMsgLatency.push(Date.now(), Date.now() - (this.socketQueue["i_" + msg.properties.correlationId]).sendTime);
                        execFunc(neigh_msg);
                        delete this.socketQueue["i_" + msg.properties.correlationId]; // to free up memory.. and it is IMPORTANT thanks  Le Droid for the reminder
                        return;
                    } else {
                        winston.error("Error: Neigh socketRecieveData", neigh_msg.result);
                    }
                }, { noAck: true });
            }).then(() => {
                //pubsub
                this.amqpNeigh.topicExchange = {}
                this.amqpNeigh.topicExchange.name = "os_env";
                return this.amqpNeigh.ch.assertExchange(this.amqpNeigh.topicExchange.name, 'fanout', { durable: false });
            })
            .then((q) => {
                return this.amqpNeigh.ch.assertQueue('', { exclusive: true });
            })
            .then((q) => {
                this.amqpNeigh.topicExchange.rspQ = q.queue;
                return this.amqpNeigh.ch.bindQueue(this.amqpNeigh.topicExchange.rspQ, this.amqpNeigh.topicExchange.name, '');
            })
            .then((q) => {
                return this.amqpNeigh.ch.consume(this.amqpNeigh.topicExchange.rspQ, (msg) => {
                    this.amqpNeigh.topicsUpdateMsg = <itf.cld_publish_topics>JSON.parse(msg.content);
                    winston.verbose("pubsub from neigh: [x] %s", msg.content.toString());
                }, { noAck: true });
            })
            .then((q) => {
                winston.info("Neighbor is ready!")
                Neighbors.getInstance().incrementActiveNeighborCount();
                this.isReady = true;
            })
            .catch((err) => {
                console.log(err);
            });

    }
    toString() {
        return 'Neighbour with ' + this.gps.toString() + " " + this.ipAddr;
    }
    setServices(services) {
        this.services = services;
    }
    neighborSendDataAmqp(data: itf.i_edge_req, onReturnFunction) {
        //console.log("Neighbor Send Data invoked!!! to ");
        this.socketQueueId++;
        if (typeof onReturnFunction == "function") {
            // the 'i_' prefix is a good way to force string indices, believe me you'll want that in case your server side doesn't care and mixes both like PHP might do
            this.socketQueue["i_" + this.socketQueueId] = {
                "retFunc": onReturnFunction,
                "sendTime": Date.now()
            };
        }
        let jsonData: itf.i_edge_req = {
            type: "neighmsg",
            cmd_id: this.socketQueueId,
            payload: data.payload,
            ttl: data.ttl,
            task_id: data.task_id,
            sentTime: data.sentTime
        };

        try {
            this.amqpNeigh.ch.sendToQueue('d_task1_req', Buffer.from(JSON.stringify(jsonData)),
                {
                    correlationId: this.socketQueueId.toString(),
                    replyTo: this.amqpNeigh.rspQ
                });
        } catch (e) {
            winston.error("Sending failed ... .disconnected failed");
        }
    }
}
export class Neighbors {
    private static instance: Neighbors;
    neighbors: Neighbor[];
    activeNeighbors: number;

    private constructor() {
        this.neighbors = [];
        this.activeNeighbors = 0;
    }

    static getInstance() {
        if (!Neighbors.instance) {
            Neighbors.instance = new Neighbors();
        }
        return Neighbors.instance;
    }
    addNeighbor(lat, lon, ipAddr: string) {
        this.neighbors.push(new Neighbor(new gps(lat, lon), ipAddr));
    }
    public getAllNeighbor(): Neighbor[] {
        return this.neighbors;
    }
    public getActiveNeighborCount(): number {
        return this.activeNeighbors;
    }
    public incrementActiveNeighborCount(): void {
        this.activeNeighbors++;
    }
    public updateNeighbors(updatedNeighbors) {
        updatedNeighbors.forEach(function (item, index, array) {
            if (!item.ipAddr.includes())
                this.addNeighbor(item.lat, item.lon, item.ipAddr);
        }, this);
    }
    removeNeighbor(neighbor) {
        this.neighbors.splice(this.neighbors.indexOf(neighbor), 1);
    }
    checkNeighborsNow() {
        //ping each neighbor and update lastUpdate time
        this.neighbors.forEach(function (item, index, array) {
            ping.promise.probe(this.ipAddr, { timeout: process.env.pingTimeout })
                .then(function (res) {
                    console.log(res);
                    //if res is unreachable call removeNeighbor(item)
                })
        })
    }
    getNeighbor(ipAddr: string): Neighbor | null {
        this.neighbors.forEach(function (item, index, array) {
            if (item.ipAddr === ipAddr) {
                return item;
            }
        }, this);
        return null;
    }
    public updateNeighborWs(ipAddr: string, neighws) {
        let neighbor = this.getNeighbor(ipAddr);
        if (neighbor !== null) {
            neighbor.neighws = neighws;
            //update last update time
        }
    }
    toString() {
        var str;
        this.neighbors.forEach(function (item, index, array) {
            str += item.ipAddr + " ";
        })
        return str;
    }
    startHeartbeat() {
        setInterval(this.checkNeighborsNow, process.env.peerHeartbeatInterval);
    }
}
/// <reference path="./ws/edge_server.ts" />