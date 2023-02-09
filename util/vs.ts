export interface CQLCode {
  system: string;
  code: string;
  display?: string;
  version?: string;
}

export interface ValueSetMap {
  [key: string]: {
    [key: string]: CQLCode[];
  };
}

function getHierarchicalCodes(
  contains: fhir4.ValueSetExpansionContains[]
): CQLCode[] {
  const codes: CQLCode[] = [];
  contains.forEach((contain) => {
    if (
      !contain.abstract &&
      !contain.inactive &&
      contain.code &&
      contain.system
    ) {
      codes.push({
        code: contain.code,
        system: contain.system,
        version: contain.version,
        display: contain.display,
      });
    }
    if (contain.contains && contain.contains.length > 0) {
      codes.push(...getHierarchicalCodes(contain.contains));
    }
  });
  return codes;
}

export function valueSetsForCodeService(
  valueSetResources: fhir4.ValueSet[]
): ValueSetMap {
  const valueSets: ValueSetMap = {};
  let valueSetId: string;
  let version: string;
  valueSetResources.forEach((valueSet) => {
    if (valueSet.url) {
      // Grab id for this valueset (should match FHIR ValueSet url)
      valueSetId = valueSet.url;
      if (!valueSets[valueSetId]) {
        valueSets[valueSetId] = {};
      }

      // Grab ValueSet version. This usually is not used.
      version = valueSet.version || "";
      if (version === "N/A") {
        version = "";
      }

      // Create array for valueset members.
      if (!valueSets[valueSetId][version]) {
        valueSets[valueSetId][version] = [];
      }
    } else {
      // TODO: handle situation where ValueSet does not have URL
    }

    if (
      valueSet.expansion &&
      valueSet.expansion.contains &&
      valueSet.expansion.contains.length > 0
    ) {
      // Default to using expansion if it exists
      valueSets[valueSetId][version] = getHierarchicalCodes(
        valueSet.expansion.contains
      );
    } else if (valueSet.compose) {
      // Only use compose if expansion doesn't exist
      // Iterate over include components and add all concepts
      valueSet.compose.include.forEach((include) => {
        include.concept?.forEach((concept) => {
          if (concept.code && include.system) {
            valueSets[valueSetId][version].push({
              code: concept.code,
              system: include.system,
              version: include.version,
              display: concept.display,
            });
          }
        });
      });
    } else {
      // TODO: Handle situation when ValueSet does not have expansion or compose.
    }
  });
  return valueSets;
}
