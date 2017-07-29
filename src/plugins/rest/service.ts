//module.exports = function rest(options) {
export function rest(options) {
  var seneca = this;
  //Plugin Init. Called when plugin is used for first time
  //plugin name (i.e function name or return string) and init: 'plugin name' should be same
  seneca.add({ init: "rest" }, function (args, done) {
    // do stuff, e.g.
    setTimeout(function () {
      console.log(" REST service init done!");
      done();
    }, 1000);
  });

  this.add({ role: "restRequest", cmd: "getDevicesList" }, function (msg, done) {
    console.log(msg);
    seneca.act({ role: "coreRequest", cmd: "getDevicesList" }, msg, function (
      err,
      reply
    ) {
      console.log(reply.result);
    });
    done(null, { result: "dev1, dev2, dev3" });
  });

  this.add({ role: "restRequest", cmd: "registerDevice" }, function (msg, done) {
    seneca.act({ role: "coreRequest", cmd: "registerDevice" }, msg, function (
      err,
      reply
    ) {
      console.log(reply.result);
    });
    done(null, {
      //id: reply.id,
      //result: reply.result
    });
  });

  this.add({ role: "restRequest", cmd: "deleteDevice" }, function (msg, done) {
    seneca.act({ role: "coreRequest", cmd: "deleteDevice" }, msg, function (
      err,
      reply
    ) {
      console.log(reply.result);
    });
    done(null, { result: "device deleted" });
  });

  this.add({ role: "restRequest", cmd: "postDataPoint" }, function (msg, done) {
    seneca.act({ role: "coreRequest", cmd: "postDataPoint" }, msg, function (
      err,
      reply
    ) {
      console.log(reply.result);
    });
    done(null, { result: "device posted a datapoint" });
  });

  this.add({ role: "restRequest", cmd: "postDataToDevice" }, function (
    msg,
    done
  ) {
    seneca.act({ role: "coreRequest", cmd: "postDataToDevice" }, msg, function (
      err,
      reply
    ) {
      console.log(reply.result);
    });
    done(null, { result: "data to device through MQTT or WS" });
  });

  this.add({ role: "restRequest", cmd: "getInfo" }, function (msg, done) {
    seneca.act({ role: "coreRequest", cmd: "getInfo" }, msg, function (
      err,
      reply
    ) {
      console.log(reply.result);
    });
    done(null, { result: "data to device through MQTT or WS" });
  });

  this.add({ role: "restRequest", cmd: "getDataPoints" }, function (msg, done) {
    seneca.act({ role: "coreRequest", cmd: "getDataPoints" }, msg, function (
      err,
      reply
    ) {
      console.log(reply.result);
    });
    done(null, { result: "data to device through MQTT or WS" });
  });

  return "rest";
};
