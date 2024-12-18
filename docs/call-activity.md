# Call activity

To call another deployed diagram you need to set called element to `deployment:<name>`. Where name is the name of the deployed target process diagram.

Example of parent process:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_1f9dfw1" targetNamespace="http://bpmn.io/schema/bpmn" exporter="Camunda Modeler" exporterVersion="5.13.0" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.19.0">
  <bpmn:process id="Process_0e9bz6l" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_0hycye8</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="Flow_0hycye8" sourceRef="StartEvent_1" targetRef="Activity_0ij2i0l" />
    <bpmn:callActivity id="Activity_0ij2i0l" name="Call other deployment" calledElement="deployment:task">
      <bpmn:incoming>Flow_0hycye8</bpmn:incoming>
      <bpmn:outgoing>Flow_14nz75w</bpmn:outgoing>
    </bpmn:callActivity>
    <bpmn:endEvent id="Event_0rjde2i">
      <bpmn:incoming>Flow_14nz75w</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_14nz75w" sourceRef="Activity_0ij2i0l" targetRef="Event_0rjde2i" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_0e9bz6l">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="179" y="99" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_0rjde2i_di" bpmnElement="Event_0rjde2i">
        <dc:Bounds x="592" y="99" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_0r5f0dl_di" bpmnElement="Activity_0ij2i0l">
        <dc:Bounds x="330" y="77" width="100" height="80" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_0hycye8_di" bpmnElement="Flow_0hycye8">
        <di:waypoint x="215" y="117" />
        <di:waypoint x="330" y="117" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_14nz75w_di" bpmnElement="Flow_14nz75w">
        <di:waypoint x="430" y="117" />
        <di:waypoint x="592" y="117" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
```

Example of called process (task):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_0aa0qjx" targetNamespace="http://bpmn.io/schema/bpmn" exporter="Camunda Modeler" exporterVersion="5.13.0" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.19.0">
  <bpmn:process id="Process_0xa818o" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1onlbrs</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Activity_19ghhan">
      <bpmn:incoming>Flow_1onlbrs</bpmn:incoming>
      <bpmn:outgoing>Flow_19d88s7</bpmn:outgoing>
    </bpmn:task>
    <bpmn:sequenceFlow id="Flow_1onlbrs" sourceRef="StartEvent_1" targetRef="Activity_19ghhan" />
    <bpmn:endEvent id="Event_1dtt64n">
      <bpmn:incoming>Flow_19d88s7</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_19d88s7" sourceRef="Activity_19ghhan" targetRef="Event_1dtt64n" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_0xa818o">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="179" y="99" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_1dtt64n_di" bpmnElement="Event_1dtt64n">
        <dc:Bounds x="432" y="99" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_19ghhan_di" bpmnElement="Activity_19ghhan">
        <dc:Bounds x="269" y="77" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1onlbrs_di" bpmnElement="Flow_1onlbrs">
        <di:waypoint x="215" y="117" />
        <di:waypoint x="269" y="117" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_19d88s7_di" bpmnElement="Flow_19d88s7">
        <di:waypoint x="369" y="117" />
        <di:waypoint x="432" y="117" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
```
