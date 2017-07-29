import mongoose = require("mongoose");

let edgedb = mongoose.createConnection("mongodb://localhost/edgeDB");

let subCategory = new mongoose.Schema(
  {
    name: String,
    typeNo: Number
  },
  { _id: false }
);

let nodeListSchema = new mongoose.Schema({
  uuid: { type: String, index: { unique: true, dropDups: true } },
  ipAddr: { type: String },
  type: { type: String },
  description: String,
  hostname: String,
  createdOn: { type: Date, default: Date.now },
  lastUpdate: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  categories: [subCategory]
});

//get model
export let NodeList = edgedb.model("NodeList", nodeListSchema);
export let Device = edgedb.model("Device", new mongoose.Schema({
  uuid: { type: String, index: { unique: true, dropDups: true } },
  ipAddr: { type: String },
  type: { type: String },
  description: String,
  hostname: String,
  createdOn: { type: Date, default: Date.now },
  lastUpdate: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  categories: [subCategory]
}));


export function cleandb() {
  //return this.NodeList.collection.drop();
}
export function getModel() {
  return NodeList;
}

