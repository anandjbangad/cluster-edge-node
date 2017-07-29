var assert = require('assert');
var RegisterDevice = require("./rest_api.js");

before(function(){
    //arrange the data here
    validDevice = new RegisterDevice({
        _id: "some ID",
        description: "Small description",
        type: "IOT"
    });
})
describe("Checking device parameters", function(){
    describe("Using valid description, type, isActive", function(){
        it("Device contains valid description and type", function(){
            assert(validDevice.isValid(), "Device is invalid")
        });
        it("description is not null");
        it("type is among allowed types IOT or quadrotor");
        it("device has isActive status")
    });
});