// var ad = mdns.createAdvertisement(mdns.tcp('http', 'caslab'), 4321);
// ad.start();
// //listen to caslab http servers
// var sequence = [
//     mdns.rst.DNSServiceResolve(),
//     'DNSServiceGetAddrInfo' in mdns.dns_sd ? mdns.rst.DNSServiceGetAddrInfo() : mdns.rst.getaddrinfo({ families: [4] }),
//     mdns.rst.makeAddressesUnique()
// ];
// var browser = mdns.createBrowser(mdns.tcp('http', 'caslab'), { resolverSequence: sequence });

// // // watch all http servers
// // var browser = mdns.createBrowser(mdns.tcp('http'));
// browser.on('serviceUp', function (service) {
//     console.log("service up: ", service.addresses[0]);
//     NodeList.findOneAndUpdate({ ipAddr: service.addresses[0] }, {
//         ipAddr: service.addresses[0],
//         description: "New device",
//         hostname: service.name
//     }, { upsert: true }, function (err, doc) {
//         //console.log(doc);
//     });
//     //add ipaddr and hostname to serverDB
// });
// browser.on('serviceDown', function (service) {
//     console.log("service down: ", service.name);
//     NodeList.remove({ hostname: service.name }, function (err) {
//         console.log(err);
//     })
//     // remove from serverDB
// });
// browser.start();
import discovery = require('dns-discovery')
import { NodeList } from "./storage.js"

var disc1 = discovery()
var disc2 = discovery()

export function findPeerNodes() {
    disc1.on('peer', function (name, peer) {
        NodeList.findOneAndUpdate({ ipAddr: peer.host }, { $set: { ipAddr: peer.host } }, function (err, doc) {
            console.log("updated");
            //get data from unicast rest api
            //store it in mongodb
        })
        console.log(name, peer);
    })
}

export function startAnnouncements() {
    // announce an app 
    disc2.announce('cas-lab-app', 9082)
}
