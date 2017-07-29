module.exports = [
  {
    method: "GET",
    path: "/devices",
    handler: function(request, reply) {
      // Invoke a Seneca action using the request decoration
      request.seneca.act(
        { role: "restRequest", cmd: "getDevicesList" },
        request.payload,
        function(err, result) {
          if (err) {
            return reply(err);
          }
          return reply(result);
        }
      );
    }
  },
  {
    method: "POST",
    path: "/devices",
    handler: function(request, reply) {
      // Invoke a Seneca action using the request decoration
      console.log("!!!!!!!!!!!!!!!!!!POST REQUEST !!!!!!!!!!!");
      request.seneca.act(
        { role: "restRequest", cmd: "registerDevice" },
        request.payload,
        function(err, result) {
          if (err) {
            return reply(err);
          }
          return reply(result);
        }
      );
    }
  },
  // {
  //     method: 'POST',
  //     path: '/devices',
  //     handler: { act: 'role:restRequest, cmd:registerDevice' } // will hit the registerDevice pattern using funky jsonic syntax
  // },
  {
    method: "DELETE",
    path: "/devices",
    handler: {
      // will hit the math pattern using full js object representation
      act: {
        role: "restRequest",
        cmd: "deleteDevice"
      }
    }
  },
  // seneca route with some sugar
  {
    method: "POST",
    path: "/devices/{deviceId}",
    handler: function(request, reply) {
      return reply.act({ role: "restRequest", cmd: "postDataPoint" });
    }
  },
  // seneca route with no magic
  {
    method: "POST",
    path: "/devices/{deviceId}/publish",
    handler: function(request, reply) {
      server.seneca.act(
        { role: "restRequest", cmd: "postDataToDevice" },
        (err, result) => {
          if (err) return console.error(err);
          reply(null, result);
        }
      );
    }
  },
  {
    method: "GET",
    path: "/getInfo",
    handler: function(request, reply) {
      // Invoke a Seneca action using the request decoration
      request.seneca.act(
        { role: "restRequest", cmd: "getInfo" },
        request.payload,
        function(err, result) {
          if (err) {
            return reply(err);
          }
          //not good practice, APIs are needed...not in this lifetime
          return reply(result);
        }
      );
    }
  }
];
