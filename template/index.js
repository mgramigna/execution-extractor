import {
  DateTime,
  Repository,
  CodeService,
  Executor,
  Interval,
} from "cql-execution";
import { PatientSource } from "cql-exec-fhir";
import fs from "fs";

const MAIN_LIB_FILE_NAME = "{{ MAIN_LIB_FILE_NAME }}";

const patient = JSON.parse(fs.readFileSync("./patient-bundle.json", "utf8"));
const vsMap = JSON.parse(fs.readFileSync("./vsmap.json", "utf8"));

const deps = fs
  .readdirSync("./elm")
  .filter((f) => f !== MAIN_LIB_FILE_NAME && f.includes(".json"))
  .map((f) => JSON.parse(fs.readFileSync(`./elm/${f}`, "utf8")));

const main = JSON.parse(fs.readFileSync(`./elm/${MAIN_LIB_FILE_NAME}`, "utf8"));

const allELM = [main, ...deps];
const cs = new CodeService(vsMap);

const rep = new Repository(allELM);
const lib = rep.resolve(
  main.library.identifier.id,
  main.library.identifier.version
);

const parameters = {
  "Measurement Period": new Interval(
    DateTime.fromJSDate(new Date("2022-01-01"), 0),
    DateTime.fromJSDate(new Date("2022-12-31"), 0)
  ),
};

const executor = new Executor(lib, cs, parameters);
const psource = PatientSource.FHIRv401();

psource.loadBundles([patient]);

const res = executor.exec(psource);

console.log(JSON.stringify(res.patientResults, null, 2));
