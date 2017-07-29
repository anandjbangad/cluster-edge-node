import neigh = require("../../neighbors.js");

var lastMsgSentTo: number = 0;
export function algoRoundRobin() {
    switch (lastMsgSentTo) {
        case 0: //local
            lastMsgSentTo = 1;
            return lastMsgSentTo;
        case 1: //cloud
            if (neigh.Neighbors.getInstance().getAllNeighbor().length) { //a neighbor exist
                lastMsgSentTo = lastMsgSentTo + 1;
                return lastMsgSentTo; //send to first neighbor
            }
        default:
            if (lastMsgSentTo < neigh.Neighbors.getInstance().getAllNeighbor().length + 1) {
                lastMsgSentTo = lastMsgSentTo + 1;
                return lastMsgSentTo; //send to one of neighbor
            } else {
                lastMsgSentTo = 0;
                return lastMsgSentTo; //don't offload
            }
    }
}