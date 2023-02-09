#!/usr/bin/env node

import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import { valueSetsForCodeService } from "./util/vs";

async function getAnswers() {
  inquirer.registerPrompt("path", require("inquirer-path").PathPrompt);
  return inquirer.prompt<{
    dstName: string;
    cqlExecVersion: string;
    measureBundlePath: string;
    patientBundlePath: string;
  }>([
    {
      name: "dstName",
      message: "Directory name",
      type: "input",
      default: "my-execution",
    },
    {
      name: "cqlExecVersion",
      message: "cql-execution version",
      type: "list",
      choices: ["2.X", "3.0.0-beta.X"],
    },
    {
      name: "measureBundlePath",
      message: "Path to Measure Bundle",
      type: "path",
    },
    {
      name: "patientBundlePath",
      message: "Path to Patient Bundle",
      type: "path",
    },
  ]);
}

function getDataFromLibrary(lib: fhir4.Library): { cql?: string; elm: string } {
  const elmContent = lib.content?.find(
    (c) => c.contentType === "application/elm+json"
  )?.data;

  const cqlContent = lib.content?.find(
    (c) => c.contentType === "text/cql"
  )?.data;

  if (!elmContent) {
    throw new Error(`ELM JSON not found on ${lib.url}`);
  }

  return {
    ...(cqlContent && { cql: Buffer.from(cqlContent, "base64").toString() }),
    elm: Buffer.from(elmContent, "base64").toString(),
  };
}

async function main() {
  const { dstName, cqlExecVersion, patientBundlePath, measureBundlePath } =
    await getAnswers();

  const dstRoot = path.join(process.cwd(), dstName);

  if (!fs.existsSync(dstRoot)) {
    fs.mkdirSync(dstRoot);
  }

  const measureBundle = JSON.parse(
    fs.readFileSync(measureBundlePath, "utf8")
  ) as fhir4.Bundle;

  if (!measureBundle.entry || measureBundle.entry.length === 0) {
    throw new Error("Measure Bundle cannot be empty");
  }

  const measure: fhir4.Measure | undefined = measureBundle.entry.find(
    (e) => e.resource?.resourceType === "Measure"
  )?.resource as fhir4.Measure;

  if (!measure) {
    throw new Error("Measure Bundle must contain a measure resource");
  }

  const libraries: fhir4.Library[] = measureBundle.entry
    .filter((e) => e.resource?.resourceType === "Library")
    .map((e) => e.resource as fhir4.Library);

  if (libraries.length === 0) {
    throw new Error("No libraries found in Measure Bundle");
  }

  if (!measure.library) {
    throw new Error("Measure must reference a main library");
  }

  const valueSets: fhir4.ValueSet[] = measureBundle.entry
    .filter((e) => e.resource?.resourceType === "ValueSet")
    ?.map((e) => e.resource as fhir4.ValueSet);

  const vsMap = valueSetsForCodeService(valueSets);

  fs.writeFileSync(
    path.join(dstRoot, "vsMap.json"),
    JSON.stringify(vsMap),
    "utf8"
  );

  const [mainLibUrl] = measure.library;

  const packageContent = fs.readFileSync(
    path.join(__dirname, "./template/package.json"),
    "utf8"
  );
  const templateIndex = fs.readFileSync(
    path.join(__dirname, "./template/index.js"),
    "utf8"
  );

  fs.writeFileSync(
    path.join(dstRoot, "package.json"),
    packageContent
      .replace("{{ PROJECT_NAME }}", dstName)
      .replace(
        "{{ CQL_EXECUTION_VERSION }}",
        cqlExecVersion === "3.0.0-beta.X" ? "^3.0.0-beta.3" : "^2.4.4"
      ),
    "utf8"
  );

  if (!fs.existsSync(path.join(dstRoot, "elm"))) {
    fs.mkdirSync(path.join(dstRoot, "elm"));
  }

  if (!fs.existsSync(path.join(dstRoot, "cql"))) {
    fs.mkdirSync(path.join(dstRoot, "cql"));
  }

  libraries.forEach((lib, i) => {
    const { cql, elm } = getDataFromLibrary(lib);
    const fileNameNoExt = lib.name ?? lib.id ?? `library-${i}`;
    fs.writeFileSync(
      path.join(dstRoot, "elm", `${fileNameNoExt}.json`),
      elm,
      "utf8"
    );

    if (cql) {
      fs.writeFileSync(
        path.join(dstRoot, "cql", `${fileNameNoExt}.cql`),
        cql,
        "utf8"
      );
    }

    if (lib.url === mainLibUrl) {
      fs.writeFileSync(
        path.join(dstRoot, "index.js"),
        templateIndex.replace(
          "{{ MAIN_LIB_FILE_NAME }}",
          `${fileNameNoExt}.json`
        )
      );
    }
  });

  fs.copyFileSync(patientBundlePath, path.join(dstRoot, "patient-bundle.json"));
  fs.copyFileSync(measureBundlePath, path.join(dstRoot, "measure-bundle.json"));
}

main();
