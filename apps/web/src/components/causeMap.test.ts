import { describe, expect, it } from "vitest";
import {
  addCauseChild,
  causeRoot,
  createDefaultCauseNodes,
  createPump101CauseMap,
  deleteCauseNode,
  layoutCauseMap,
  nodeIsDimmed,
  setCauseEdgeType,
  toggleCauseCollapsed,
  updateCauseNode,
} from "./causeMap";

describe("cause map layout and edits", () => {
  it("starts with a single root and keeps it when deleting is requested", () => {
    const nodes = createDefaultCauseNodes("Trip of P-101");
    expect(nodes).toHaveLength(1);
    expect(causeRoot(nodes).label).toBe("Trip of P-101");
    expect(deleteCauseNode(nodes, nodes[0].id)).toEqual(nodes);
  });

  it("adds children and auto-aligns them to the right in a horizontal layout", () => {
    const root = createDefaultCauseNodes("Root")[0];
    let nodes = [root];
    nodes = addCauseChild(nodes, root.id, "Cause A");
    nodes = addCauseChild(nodes, root.id, "Cause B");
    const laidOut = layoutCauseMap(nodes, "horizontal");
    const rootBox = laidOut.boxes.find((box) => box.isRoot)!;
    const children = laidOut.boxes.filter((box) => box.parentId === root.id).sort((left, right) => left.y - right.y);
    expect(children).toHaveLength(2);
    expect(children[0].x).toBeGreaterThan(rootBox.x + rootBox.width);
    expect(children[1].x).toBe(children[0].x);
    expect(children[1].y).toBeGreaterThan(children[0].y + children[0].height);
    expect(rootBox.y + rootBox.height / 2).toBeCloseTo((children[0].y + children[1].y + children[1].height) / 2, 0);
  });

  it("stacks children below the root in a vertical layout and recenters siblings", () => {
    const root = createDefaultCauseNodes("Root")[0];
    let nodes = addCauseChild([root], root.id, "Cause A");
    nodes = addCauseChild(nodes, root.id, "Cause B");
    const laidOut = layoutCauseMap(nodes, "vertical");
    const rootBox = laidOut.boxes.find((box) => box.isRoot)!;
    const children = laidOut.boxes.filter((box) => box.parentId === root.id).sort((left, right) => left.x - right.x);
    expect(children[0].y).toBeGreaterThan(rootBox.y + rootBox.height);
    expect(children[1].y).toBe(children[0].y);
    expect(children[1].x).toBeGreaterThan(children[0].x + children[0].width);
    expect(rootBox.x + rootBox.width / 2).toBeCloseTo((children[0].x + children[1].x + children[1].width) / 2, 0);
  });

  it("deletes a node and its descendants, then realigns the remaining tree", () => {
    const nodes = createPump101CauseMap();
    const root = causeRoot(nodes);
    const valve = nodes.find((node) => node.label.includes("CV-101") || node.label.startsWith("Control valve"))!;
    const remaining = deleteCauseNode(nodes, valve.id);
    expect(remaining.some((node) => node.label.includes("CV-101") || node.label.includes("执行机构") || node.label.includes("定位器") || node.label.includes("Actuator") || node.label.includes("Positioner"))).toBe(false);
    expect(remaining.some((node) => node.id === root.id)).toBe(true);
    const laidOut = layoutCauseMap(remaining, "horizontal");
    expect(laidOut.boxes).toHaveLength(remaining.length);
    expect(laidOut.edges.every((edge) => remaining.some((node) => node.id === edge.toId))).toBe(true);
  });

  it("updates a cause label in place", () => {
    const nodes = createDefaultCauseNodes("Root");
    const updated = updateCauseNode(nodes, nodes[0].id, { label: "P-101 trip", detail: "Area A" });
    expect(updated[0]).toMatchObject({ label: "P-101 trip", detail: "Area A" });
  });
});

  it("collapses a node to one level and keeps horizontal / vertical alignment", () => {
    const nodes = createPump101CauseMap();
    const valve = nodes.find((node) => node.label.includes("CV-101") || node.label.startsWith("Control valve"))!;
    expect(layoutCauseMap(nodes, "horizontal").boxes.some((box) => box.label.includes("Actuator") || box.label.includes("执行机构"))).toBe(true);
    const collapsed = toggleCauseCollapsed(nodes, valve.id);
    const horizontal = layoutCauseMap(collapsed, "horizontal");
    const vertical = layoutCauseMap(collapsed, "vertical");
    expect(horizontal.boxes.some((box) => box.id === valve.id && box.collapsed && box.childCount === 2)).toBe(true);
    expect(horizontal.boxes.some((box) => box.label.includes("Actuator") || box.label.includes("执行机构"))).toBe(false);
    expect(vertical.boxes.some((box) => box.label.includes("Actuator") || box.label.includes("执行机构"))).toBe(false);
    const rootBox = horizontal.boxes.find((box) => box.isRoot)!;
    const demand = horizontal.boxes.find((box) => box.label.includes("需求") || box.label.startsWith("Increased"))!;
    expect(demand.x).toBeGreaterThan(rootBox.x + rootBox.width);
  });

  it("stores typed edges and dims nodes that do not match a filter", () => {
    const nodes = createPump101CauseMap();
    const valve = nodes.find((node) => node.label.includes("CV-101") || node.label.startsWith("Control valve"))!;
    expect(valve.edgeType).toBe("causes");
    const relabeled = setCauseEdgeType(nodes, valve.id, "feeds");
    expect(relabeled.find((node) => node.id === valve.id)?.edgeType).toBe("feeds");
    const laidOut = layoutCauseMap(relabeled, "horizontal");
    expect(laidOut.edges.some((edge) => edge.toId === valve.id && edge.label === "供给")).toBe(true);
    expect(nodeIsDimmed(relabeled, valve.id, "feeds")).toBe(false);
    const positioner = relabeled.find((node) => node.label.includes("定位器") || node.label.startsWith("Positioner"))!;
    expect(nodeIsDimmed(relabeled, positioner.id, "feeds")).toBe(true);
    expect(nodeIsDimmed(relabeled, positioner.id, "all")).toBe(false);
  });
