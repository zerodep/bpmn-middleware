import { stripCollidingModdleProperties } from '../../example/middleware/moddle.js';

describe('example stripCollidingModdleProperties', () => {
  it('strips colliding modeler properties from types extending bpmn types', () => {
    const patched = stripCollidingModdleProperties({
      types: [
        {
          name: 'Task',
          extends: ['bpmn:Task'],
          properties: [{ name: 'modelerTemplate' }, { name: 'versionTag' }, { name: 'taskDefinition' }],
        },
      ],
    });

    expect(patched.types[0].properties).to.deep.equal([{ name: 'taskDefinition' }]);
  });

  it('leaves types that does not extend bpmn types untouched', () => {
    const schema = { types: [{ name: 'IoMapping', properties: [{ name: 'versionTag' }] }] };
    const patched = stripCollidingModdleProperties(schema);

    expect(patched.types[0].properties).to.deep.equal([{ name: 'versionTag' }]);
  });

  it('tolerates types extending bpmn types without properties', () => {
    const patched = stripCollidingModdleProperties({ types: [{ name: 'Process', extends: ['bpmn:Process'] }] });

    expect(patched.types[0].properties).to.deep.equal([]);
  });

  it('does not mutate the passed schema', () => {
    const schema = { types: [{ name: 'Task', extends: ['bpmn:Task'], properties: [{ name: 'versionTag' }] }] };
    stripCollidingModdleProperties(schema);

    expect(schema.types[0].properties).to.have.length(1);
  });
});
