/**
 * camunda-bpmn-moddle and zeebe-bpmn-moddle both extend the same bpmn base types with
 * modeler metadata properties. Moddle refuses the double property definition and the
 * process element becomes unparsable. Strip the colliding properties from the zeebe
 * schema, they carry no runtime behaviour.
 * @param {any} schema zeebe-bpmn-moddle schema
 */
export function stripCollidingModdleProperties(schema) {
  const collidingProperties = ['modelerTemplate', 'modelerTemplateVersion', 'versionTag'];
  const patched = JSON.parse(JSON.stringify(schema));
  for (const type of patched.types) {
    if (!type.extends?.some((extended) => extended.startsWith('bpmn:'))) continue;
    type.properties = (type.properties || []).filter((p) => !collidingProperties.includes(p.name));
  }
  return patched;
}
