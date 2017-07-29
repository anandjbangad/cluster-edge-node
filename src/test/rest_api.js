var assert = require("assert");
var _ = require("underscore")._;

var RegisterDevice = function(args){
    _.extend(this, args);

    this.descriptionIsValid = function(){
        return this.description.length() > 0;
    };

    this.typeIsValid = function(){
        return (this.type =="IOT") || (this.type == "quadrotor");
    };

    this.isValid = function(){
        return this.descriptionIsValid &&
            this.typeIsValid
    };
}

module.exports = RegisterDevice;