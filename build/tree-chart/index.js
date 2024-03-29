import * as d3 from 'd3';
import { ANIMATION_DURATION, DEFAULT_HEIGHT_DECREMENT, DEFAULT_LEVEL_HEIGHT, DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH, MATCH_SCALE_REGEX, MATCH_TRANSLATE_REGEX } from './constant';
import { Direction, TreeLinkStyle } from './tree-chart';
import { deepCopy, rotatePoint } from './util';
var TreeChartCore = /** @class */ (function () {
    function TreeChartCore(params) {
        this.treeConfig = {
            nodeWidth: DEFAULT_NODE_WIDTH,
            nodeHeight: DEFAULT_NODE_HEIGHT,
            levelHeight: DEFAULT_LEVEL_HEIGHT,
        };
        this.linkStyle = TreeLinkStyle.CURVE;
        this.direction = Direction.VERTICAL;
        this.collapseEnabled = true;
        this.currentScale = 1;
        if (params.treeConfig) {
            this.treeConfig = params.treeConfig;
        }
        this.collapseEnabled = params.collapseEnabled;
        this.svgElement = params.svgElement;
        this.domElement = params.domElement;
        this.treeContainer = params.treeContainer;
        this.dataset = this.updatedInternalData(params.dataset);
        if (params.direction)
            this.direction = params.direction;
        if (params.linkStyle)
            this.linkStyle = params.linkStyle;
    }
    TreeChartCore.prototype.init = function () {
        this.draw();
        this.enableDrag();
        this.initTransform();
    };
    TreeChartCore.prototype.getNodeDataList = function () {
        return this.nodeDataList;
    };
    TreeChartCore.prototype.getInitialTransformStyle = function () {
        return {
            transform: "scale(1) translate(".concat(this.initTransformX, "px, ").concat(this.initTransformY, "px)"),
            transformOrigin: "center",
        };
    };
    TreeChartCore.prototype.zoomIn = function () {
        var originTransformStr = this.domElement.style.transform;
        // 如果已有scale属性, 在原基础上修改
        var targetScale = 1 * 1.2;
        var scaleMatchResult = originTransformStr.match(MATCH_SCALE_REGEX);
        if (scaleMatchResult && scaleMatchResult.length > 0) {
            var originScale = parseFloat(scaleMatchResult[1]);
            targetScale *= originScale;
        }
        this.setScale(targetScale);
    };
    TreeChartCore.prototype.zoomOut = function () {
        var originTransformStr = this.domElement.style.transform;
        // 如果已有scale属性, 在原基础上修改
        var targetScale = 1 / 1.2;
        var scaleMatchResult = originTransformStr.match(MATCH_SCALE_REGEX);
        if (scaleMatchResult && scaleMatchResult.length > 0) {
            var originScale = parseFloat(scaleMatchResult[1]);
            targetScale = originScale / 1.2;
        }
        this.setScale(targetScale);
    };
    TreeChartCore.prototype.restoreScale = function () {
        this.setScale(1);
    };
    TreeChartCore.prototype.setScale = function (scaleNum) {
        if (typeof scaleNum !== "number")
            return;
        var pos = this.getTranslate();
        var translateString = "translate(".concat(pos[0], "px, ").concat(pos[1], "px)");
        this.svgElement.style.transform = "scale(".concat(scaleNum, ") ") + translateString;
        this.domElement.style.transform =
            "scale(".concat(scaleNum, ") ") + translateString;
        this.currentScale = scaleNum;
    };
    TreeChartCore.prototype.getTranslate = function () {
        var string = this.svgElement.style.transform;
        var match = string.match(MATCH_TRANSLATE_REGEX);
        if (match === null) {
            return [null, null];
        }
        var x = parseInt(match[1]);
        var y = parseInt(match[2]);
        return [x, y];
    };
    TreeChartCore.prototype.isVertical = function () {
        return this.direction === Direction.VERTICAL;
    };
    /**
   * 根据link数据,生成svg path data
   */
    TreeChartCore.prototype.generateLinkPath = function (d) {
        var self = this;
        if (this.linkStyle === TreeLinkStyle.CURVE) {
            return this.generateCurceLinkPath(self, d);
        }
        if (this.linkStyle === TreeLinkStyle.STRAIGHT) {
            // the link path is: source -> secondPoint -> thirdPoint -> target
            return this.generateStraightLinkPath(d);
        }
    };
    TreeChartCore.prototype.generateCurceLinkPath = function (self, d) {
        var linkPath = this.isVertical()
            ? d3.linkVertical()
            : d3.linkHorizontal();
        linkPath
            .x(function (d) {
            return d.x;
        })
            .y(function (d) {
            return d.y;
        })
            .source(function (d) {
            var sourcePoint = {
                x: d.source.x,
                y: d.source.y,
            };
            return self.direction === Direction.VERTICAL
                ? sourcePoint
                : rotatePoint(sourcePoint);
        })
            .target(function (d) {
            var targetPoint = {
                x: d.target.x,
                y: d.target.y,
            };
            return self.direction === Direction.VERTICAL
                ? targetPoint
                : rotatePoint(targetPoint);
        });
        return linkPath(d);
    };
    TreeChartCore.prototype.generateStraightLinkPath = function (d) {
        var linkPath = d3.path();
        var sourcePoint = { x: d.source.x, y: d.source.y };
        var targetPoint = { x: d.target.x, y: d.target.y };
        if (!this.isVertical()) {
            sourcePoint = rotatePoint(sourcePoint);
            targetPoint = rotatePoint(targetPoint);
        }
        var xOffset = targetPoint.x - sourcePoint.x;
        var yOffset = targetPoint.y - sourcePoint.y;
        var secondPoint = this.isVertical()
            ? { x: sourcePoint.x, y: sourcePoint.y + yOffset / 2 }
            : { x: sourcePoint.x + xOffset / 2, y: sourcePoint.y };
        var thirdPoint = this.isVertical()
            ? { x: targetPoint.x, y: sourcePoint.y + yOffset / 2 }
            : { x: sourcePoint.x + xOffset / 2, y: targetPoint.y };
        linkPath.moveTo(sourcePoint.x, sourcePoint.y);
        linkPath.lineTo(secondPoint.x, secondPoint.y);
        linkPath.lineTo(thirdPoint.x, thirdPoint.y);
        linkPath.lineTo(targetPoint.x, targetPoint.y);
        return linkPath.toString();
    };
    TreeChartCore.prototype.updateDataList = function () {
        var _a = this.buildTree(), nodeDataList = _a[0], linkDataList = _a[1];
        nodeDataList.splice(0, 1);
        linkDataList = linkDataList.filter(function (x) { return x.source.data.name !== "__invisible_root"; });
        this.linkDataList = linkDataList;
        this.nodeDataList = nodeDataList;
    };
    TreeChartCore.prototype.draw = function () {
        this.updateDataList();
        var identifier = this.dataset["identifier"];
        var specialLinks = this.dataset["links"];
        if (specialLinks && identifier) {
            var _loop_1 = function (link) {
                var parent_1 = void 0, children = undefined;
                if (identifier === "value") {
                    parent_1 = this_1.nodeDataList.find(function (d) {
                        return d[identifier] == link.parent;
                    });
                    children = this_1.nodeDataList.filter(function (d) {
                        return d[identifier] == link.child;
                    });
                }
                else {
                    parent_1 = this_1.nodeDataList.find(function (d) {
                        return d["data"][identifier] == link.parent;
                    });
                    children = this_1.nodeDataList.filter(function (d) {
                        return d["data"][identifier] == link.child;
                    });
                }
                if (parent_1 && children) {
                    for (var _a = 0, children_1 = children; _a < children_1.length; _a++) {
                        var child = children_1[_a];
                        var new_link = {
                            source: parent_1,
                            target: child,
                        };
                        this_1.linkDataList.push(new_link);
                    }
                }
            };
            var this_1 = this;
            for (var _i = 0, specialLinks_1 = specialLinks; _i < specialLinks_1.length; _i++) {
                var link = specialLinks_1[_i];
                _loop_1(link);
            }
        }
        this.svgSelection = d3.select(this.svgElement);
        var self = this;
        var links = this.svgSelection
            .selectAll(".link")
            .data(this.linkDataList, function (d) {
            return "".concat(d.source.data._key, "-").concat(d.target.data._key);
        });
        links
            .enter()
            .append("path")
            .style("opacity", 0)
            .transition()
            .duration(ANIMATION_DURATION)
            .ease(d3.easeCubicInOut)
            .style("opacity", 1)
            .attr("class", "link")
            .attr("d", function (d) {
            return self.generateLinkPath(d);
        });
        links
            .transition()
            .duration(ANIMATION_DURATION)
            .ease(d3.easeCubicInOut)
            .attr("d", function (d) {
            return self.generateLinkPath(d);
        });
        links
            .exit()
            .transition()
            .duration(ANIMATION_DURATION / 2)
            .ease(d3.easeCubicInOut)
            .style("opacity", 0)
            .remove();
    };
    /**
   * Returns updated dataset by deep copying every nodes from the externalData and adding unique '_key' attributes.
   **/
    TreeChartCore.prototype.updatedInternalData = function (externalData) {
        var data = { name: "__invisible_root", children: [] };
        if (!externalData)
            return data;
        if (Array.isArray(externalData)) {
            for (var i = externalData.length - 1; i >= 0; i--) {
                data.children.push(deepCopy(externalData[i]));
            }
        }
        else {
            data.children.push(deepCopy(externalData));
        }
        return data;
    };
    TreeChartCore.prototype.buildTree = function () {
        var treeBuilder = d3
            .tree()
            .nodeSize([this.treeConfig.nodeWidth, this.treeConfig.levelHeight]);
        var tree = treeBuilder(d3.hierarchy(this.dataset));
        return [tree.descendants(), tree.links()];
    };
    TreeChartCore.prototype.enableDrag = function () {
        var _this = this;
        var startX = 0;
        var startY = 0;
        var isDrag = false;
        // 保存鼠标点下时的位移
        var mouseDownTransform = "";
        this.treeContainer.onpointerdown = function (event) {
            mouseDownTransform = _this.svgElement.style.transform;
            startX = event.clientX;
            startY = event.clientY;
            isDrag = true;
        };
        this.treeContainer.onpointermove = function (event) {
            if (!isDrag)
                return;
            var originTransform = mouseDownTransform;
            var originOffsetX = 0;
            var originOffsetY = 0;
            if (originTransform) {
                var result = originTransform.match(MATCH_TRANSLATE_REGEX);
                if (result !== null && result.length !== 0) {
                    var _a = result.slice(1), offsetX = _a[0], offsetY = _a[1];
                    originOffsetX = parseInt(offsetX);
                    originOffsetY = parseInt(offsetY);
                }
            }
            var newX = Math.floor((event.clientX - startX) / _this.currentScale) +
                originOffsetX;
            var newY = Math.floor((event.clientY - startY) / _this.currentScale) +
                originOffsetY;
            var transformStr = "translate(".concat(newX, "px, ").concat(newY, "px)");
            if (originTransform) {
                transformStr = originTransform.replace(MATCH_TRANSLATE_REGEX, transformStr);
            }
            _this.svgElement.style.transform = transformStr;
            _this.domElement.style.transform = transformStr;
        };
        this.treeContainer.onpointerup = function () {
            startX = 0;
            startY = 0;
            isDrag = false;
        };
    };
    TreeChartCore.prototype.initTransform = function () {
        var containerWidth = this.domElement.offsetWidth;
        var containerHeight = this.domElement.offsetHeight;
        if (this.isVertical()) {
            this.initTransformX = Math.floor(containerWidth / 2);
            this.initTransformY = Math.floor(this.treeConfig.nodeHeight - DEFAULT_HEIGHT_DECREMENT);
        }
        else {
            this.initTransformX = Math.floor(this.treeConfig.nodeWidth - DEFAULT_HEIGHT_DECREMENT);
            this.initTransformY = Math.floor(containerHeight / 2);
        }
    };
    TreeChartCore.prototype.onClickNode = function (index) {
        if (this.collapseEnabled) {
            var curNode = this.nodeDataList[index];
            if (curNode.data.children) {
                curNode.data._children = curNode.data.children;
                curNode.data.children = null;
                curNode.data._collapsed = true;
            }
            else {
                curNode.data.children = curNode.data._children;
                curNode.data._children = null;
                curNode.data._collapsed = false;
            }
            this.draw();
        }
    };
    /**
     * call this function to update dataset
     * notice : you need to update the view rendered by `nodeDataList` too
     * @param dataset the new dataset to show in chart
     */
    TreeChartCore.prototype.updateDataset = function (dataset) {
        this.dataset = this.updatedInternalData(dataset);
        this.draw();
    };
    /**
     * release all dom reference
     */
    TreeChartCore.prototype.destroy = function () {
        this.svgElement = null;
        this.domElement = null;
        this.treeContainer = null;
    };
    return TreeChartCore;
}());
export default TreeChartCore;
