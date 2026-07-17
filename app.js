(() => {
'use strict';

const WORLD_W = 1920;
const WORLD_H = 1080;

const pct = p => WORLD_W * p / 100;
const pctH = p => WORLD_H * p / 100;

const FONT_FAMILY = '"Doulos SIL", "Times New Roman", "Palatino Linotype", Times, Palatino, Georgia, serif';

const DEFAULT_SETTINGS = () => ({
    showTermLines: false,
    enableTriangles: true,
    horzSpacing: 0,
    nontermVerticalDistance: 8,
    termVerticalDistance: 6,
    bgColor: { r: 255, g: 255, b: 255, a: 255 },
    lineColor: { r: 0, g: 0, b: 0, a: 255 },
    nonTermColor: { r: 0, g: 0, b: 255, a: 255 },
    termColor: { r: 0, g: 128, b: 0, a: 255 },
});

function getTermDistance(settings) {
    return settings.showTermLines ? settings.nontermVerticalDistance : settings.termVerticalDistance;
}

function colorToCss(c) {
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a / 255})`;
}

function colorToHex(c) {
    const h = n => n.toString(16).padStart(2, '0');
    return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

let uidCounter = 0;
function generateUID() {
    uidCounter += 1;
    return 'n' + Date.now().toString(36) + '_' + (uidCounter).toString(36);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const state = {
    nodes: new Map(),
    rootId: null,
    settings: DEFAULT_SETTINGS(),

    camera: { x: WORLD_W / 2, y: WORLD_H / 2, scale: 1 },

    armedId: null,
    subscriptEditId: null, 
    panning: false,
    lastScreen: { x: 0, y: 0 },
    activePressNodeId: null,
    pressedInsideButton: false,
    hoverNodeId: null,
    showDebug: false,
    selectedColorKey: null,
    selectedTool: 'pointer',
    treeTitle: 'NewTree',
    titleModalOpen: false,
    confirmationModalOpen: false,
    confirmationModalReturnValue: null
};

const canvas = document.getElementById('tree-canvas');
let ctx = canvas.getContext('2d');
const hiddenInput = document.getElementById('hidden-text-input');
const hintBar = document.getElementById('hint-bar');

function measureNode(text, subscript) {
    const fontSize = pct(2.5);
    ctx.font = `${fontSize}px ${FONT_FAMILY}`;
    const textWidth = ctx.measureText(text || '').width;
    const textHeight = fontSize * 1.15;

    let subWidth = 0;
    if (subscript && subscript.trim() !== '') {
        const subSize = pct(1.75);
        ctx.font = `${subSize}px ${FONT_FAMILY}`;
        subWidth = ctx.measureText(subscript).width;
    }

    const padding = pct(1);
    const minWidth = pct(3);
    const minHeight = pctH(5);

    return {
        width: Math.max(minWidth, textWidth + padding * 2 + subWidth),
        height: Math.max(minHeight, textHeight),
    };
}

function hasSubscript(node) {
    return node.subscript && node.subscript.trim() !== '';
}

function hasChildren(node) {
    return node.children.length > 0;
}

function getNode(id) {
    return id ? state.nodes.get(id) : null;
}

function getParent(node) {
    return node.parentId ? state.nodes.get(node.parentId) : null;
}

function createNode(parentId, xPct, yPct, id) {
    const nodeId = id || generateUID();
    const centerX = WORLD_W * xPct / 100;
    const centerY = WORLD_H * yPct / 100;

    const size = measureNode('XP', '');
    const padding = pct(1);
    const pos = { x: centerX - size.width / 2, y: centerY - size.height / 2 };
    const origin = { x: pos.x + size.width / 2 + padding, y: pos.y + size.height / 2 };

    const node = {
        id: nodeId,
        parentId: parentId,
        children: [],
        pos, origin, size,
        text: 'XP',
        subscript: '',
        hasMovement: false,
        endPointId: null,
        curveAngle: 0,
        curveHeight: 0,
        drawTriangle: false,
        selectingMovement: false,
        movementLineVertex: pos.y + size.height,
        hovered: false,
        armed: false,
    };

    state.nodes.set(nodeId, node);
    return node;
}

function moveNode(node, dx, dy) {
    node.pos.x += dx; node.pos.y += dy;
    node.origin.x += dx; node.origin.y += dy;
}

function addChildToNode(parent, left) {
    if (!state.settings.showTermLines && !hasChildren(parent) && parent.parentId &&
        !parent.drawTriangle && getParent(parent).children.length === 1) {
        moveNode(parent, 0, pctH(getTermDistance(state.settings)));
    }

    const xPct = (parent.pos.x / WORLD_W * 100) + (parent.size.width / 2 / WORLD_W * 100);
    const yPct = (parent.pos.y / WORLD_H * 100) + state.settings.nontermVerticalDistance;
    const child = createNode(parent.id, xPct, yPct);

    if (left) parent.children.unshift(child.id);
    else parent.children.push(child.id);

    parent.drawTriangle = false;
    return child;
}

function deleteNode(id) {
    const node = getNode(id);
    if (!node) return;
    for (const childId of [...node.children]) deleteNode(childId);

    const parent = getParent(node);
    if (parent) parent.children = parent.children.filter(c => c !== id);

    state.nodes.delete(id);

    if (state.armedId === id) {
        state.armedId = null;
        hiddenInput.blur();
        hiddenInput.style.display = 'none';
    }
    if (state.subscriptEditId === id) {
        state.subscriptEditId = null;
        document.getElementById('subscript-modal').classList.remove('visible');
    }
    if (state.activePressNodeId === id) state.activePressNodeId = null;
    if (state.hoverNodeId === id) state.hoverNodeId = null;

    for (const n of state.nodes.values()) {
        if (n.endPointId === id) { n.hasMovement = false; n.endPointId = null; }
    }

    if (state.rootId === id) {
        state.rootId = null;
    }
}

function resetTree() {
    state.nodes.clear();
    state.armedId = null;
    state.subscriptEditId = null;
    state.activePressNodeId = null;
    state.hoverNodeId = null;
    const root = createNode(null, 50, 50);
    state.rootId = root.id;
    state.treeTitle = 'NewTree';
}

function alignNode(node) {
    const children = node.children.map(getNode);
    const nodeWidth = node.size.width;

    if (children.length === 0) {
        const half = nodeWidth * 0.5;
        return { left: half, right: half };
    }

    const horzSpace = state.settings.horzSpacing; 
    const cw = children.map(alignNode);

    let step = 0;
    for (let i = 0; i + 1 < children.length; i++) {
        const required = cw[i].right + horzSpace + cw[i + 1].left;
        step = Math.max(step, required);
    }

    const n = children.length;
    const halfSpread = ((n - 1) * 0.5) * step;

    const leftWidth = Math.max(halfSpread + cw[0].left, nodeWidth * 0.5);
    const rightWidth = Math.max(halfSpread + cw[n - 1].right, nodeWidth * 0.5);

    const parentCenter = node.pos.x + nodeWidth * 0.5;
    const leftStart = parentCenter - halfSpread;

    for (let i = 0; i < n; i++) {
        const childCenter = leftStart + i * step;
        const child = children[i];
        const currentCenter = child.pos.x + child.size.width * 0.5;
        moveNode(child, childCenter - currentCenter, 0);
    }

    return { left: leftWidth, right: rightWidth };
}

function updateNode(node) {
    const parent = getParent(node);

    if (parent) {
        const dist = node.pos.y - parent.pos.y;
        if (dist <= pctH(state.settings.nontermVerticalDistance)) {
            if (hasChildren(node) || parent.children.length > 1 || hasSubscript(node) ||
                node.drawTriangle || state.settings.showTermLines) {
                moveNode(node, 0, pctH(getTermDistance(state.settings)));
            }
        } else if (dist >= pctH(state.settings.nontermVerticalDistance) && !state.settings.showTermLines) {
            if (!hasChildren(node) && parent.children.length === 1 && !hasSubscript(node) && !node.drawTriangle) {
                moveNode(node, 0, -pctH(state.settings.termVerticalDistance));
            }
        }
    }

    const size = measureNode(node.text, node.subscript);
    node.size = size;

    const padding = pct(1);
    node.pos.x = node.origin.x - size.width / 2 - padding;
    node.pos.y = node.origin.y - size.height / 2;
    if (hasSubscript(node)) {
        const subSize = pct(1.75);
        ctx.font = `${subSize}px ${FONT_FAMILY}`;
        const subWidth = ctx.measureText(node.subscript).width;
        node.pos.x += subWidth / 2;
    }
}

function worldToScreen(x, y) {
    return {
        x: (x - state.camera.x) * state.camera.scale + canvas.clientWidth / 2,
        y: (y - state.camera.y) * state.camera.scale + canvas.clientHeight / 2,
    };
}

function screenToWorld(x, y) {
    return {
        x: (x - canvas.clientWidth / 2) / state.camera.scale + state.camera.x,
        y: (y - canvas.clientHeight / 2) / state.camera.scale + state.camera.y,
    };
}

function nodeContainsWorldPoint(node, wx, wy) {
    return wx >= node.pos.x && wx <= node.pos.x + node.size.width &&
        wy >= node.pos.y && wy <= node.pos.y + node.size.height;
}

function drawLine(p1, p2, thickness, color) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len, uy = dy / len;
    const px = -uy * thickness / 2, py = ux * thickness / 2;

    ctx.beginPath();
    ctx.moveTo(p1.x + px, p1.y + py);
    ctx.lineTo(p2.x + px, p2.y + py);
    ctx.lineTo(p2.x - px, p2.y - py);
    ctx.lineTo(p1.x - px, p1.y - py);
    ctx.closePath();
    ctx.fillStyle = colorToCss(color);
    ctx.fill();
}

function connectToParent(node) {
    const parent = getParent(node);
    if (!parent) return;

    const soleChild = parent.children.length === 1;

    if (!node.drawTriangle || !soleChild) {
        if (state.settings.showTermLines || hasChildren(node) || parent.children.length > 1 || hasSubscript(node)) {
            drawLine(
                { x: parent.pos.x + parent.size.width / 2, y: parent.pos.y + parent.size.height },
                { x: node.pos.x + node.size.width / 2, y: node.pos.y },
                4, state.settings.lineColor
            );
        }
    } else if (node.drawTriangle && soleChild) {
        const parentBottom = { x: parent.pos.x + parent.size.width / 2, y: parent.pos.y + parent.size.height };
        const leftCorner = { x: node.pos.x, y: node.pos.y };
        const rightCorner = { x: node.pos.x + node.size.width, y: node.pos.y };
        drawLine(parentBottom, leftCorner, 4, state.settings.lineColor);
        drawLine(parentBottom, rightCorner, 4, state.settings.lineColor);
        drawLine(leftCorner, rightCorner, 4, state.settings.lineColor);
    }
}

function drawButton(x, y, size, kind, hovered) {
    ctx.save();
    ctx.translate(x, y);
    const bg = hovered ? 'rgba(60,90,130,0.95)' : 'rgba(60,90,130,0.75)';
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, size, size, size * 0.2);
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1.5, size * 0.09);
    ctx.lineCap = 'round';
    const m = size * 0.28;
    ctx.beginPath();
    if (kind === 'plus' || kind === 'leftPlus') {
        ctx.moveTo(size / 2, m); ctx.lineTo(size / 2, size - m);
        ctx.moveTo(m, size / 2); ctx.lineTo(size - m, size / 2);
    } else if (kind === 'minus') {
        ctx.moveTo(m, size / 2); ctx.lineTo(size - m, size / 2);
    } else if (kind === 'triangle') {
        ctx.moveTo(size / 2, m);
        ctx.lineTo(size - m, size - m);
        ctx.lineTo(m, size - m);
        ctx.closePath();
    }
    ctx.stroke();
    ctx.restore();
}

function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
}

function drawNodeButtons(node) {
    const btnSize = pct(1.25);
    const plus = { x: node.pos.x + node.size.width - btnSize, y: node.pos.y + node.size.height - btnSize };
    const leftPlus = { x: node.pos.x, y: node.pos.y + node.size.height - btnSize };
    const minus = { x: node.pos.x, y: node.pos.y };
    const triangle = { x: node.pos.x + node.size.width - btnSize, y: node.pos.y };

    const mouse = state.worldMouse || { x: -99999, y: -99999 };
    const hit = (p) => mouse.x >= p.x && mouse.x <= p.x + btnSize && mouse.y >= p.y && mouse.y <= p.y + btnSize;

    drawButton(plus.x, plus.y, btnSize, 'plus', hit(plus));
    drawButton(leftPlus.x, leftPlus.y, btnSize, 'leftPlus', hit(leftPlus));
    if (node.parentId) drawButton(minus.x, minus.y, btnSize, 'minus', hit(minus));
    const parent = getParent(node);
    if (state.settings.enableTriangles && parent && parent.children.length === 1 && !hasChildren(node)) {
        drawButton(triangle.x, triangle.y, btnSize, 'triangle', hit(triangle));
    }

    node._buttons = { plus, leftPlus, minus, triangle, btnSize };
}

function drawMovementLine(node) {
    const p0 = {
        x: node.pos.x + node.size.width / 2,
        y: node.pos.y + node.size.height + pctH(0.5),
    };

    const endNode = getNode(node.endPointId);
    const usingEndpoint = (node.hasMovement || endNode);
    const mouse = state.worldMouse || { x: node.pos.x, y: node.pos.y };
    const p1 = usingEndpoint && endNode ? {
        x: endNode.pos.x + endNode.size.width / 2,
        y: endNode.pos.y + endNode.size.height + pctH(0.5),
    } : {
        x: mouse.x + pct(0.5),
        y: mouse.y + pctH(2),
    };

    const control = {
        x: (0.5 + node.curveAngle) * (p0.x + p1.x),
        y: (0.5 + node.curveAngle) * (p0.y + p1.y),
    };
    control.y += (-500 - node.curveHeight) + (p0.y + p1.y) / 2;

    const bez = t => {
        const u = 1 - t;
        return {
            x: u * u * p0.x + 2 * u * t * control.x + t * t * p1.x,
            y: u * u * p0.y + 2 * u * t * control.y + t * t * p1.y,
        };
    };

    const segments = 20;
    let lastA = null, lastB = null;
    for (let i = 0; i < segments; i++) {
        const t0 = i / segments, t1 = (i + 1) / segments;
        const a = bez(t0), b = bez(t1);
        node.movementLineVertex = Math.max(node.movementLineVertex, Math.max(a.y, b.y));
        drawLine(a, b, 4, state.settings.lineColor);
        lastA = a; lastB = b;
    }

    const angle = Math.atan2(lastA.y - lastB.y, lastA.x - lastB.x) + (270 * Math.PI / 180);
    const arrowSize = 20, flair = 4;
    const verts = [
        { x: -arrowSize / 2, y: flair },
        { x: 0, y: -arrowSize },
        { x: arrowSize / 2, y: flair },
        { x: 0, y: 0 },
    ];
    ctx.save();
    ctx.beginPath();
    verts.forEach((v, i) => {
        const rx = v.x * Math.cos(angle) - v.y * Math.sin(angle) + p1.x;
        const ry = v.x * Math.sin(angle) + v.y * Math.cos(angle) + p1.y;
        if (i === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
    });
    ctx.closePath();
    ctx.fillStyle = colorToCss(state.settings.lineColor);
    ctx.fill();
    ctx.restore();
}

function drawNode(node, exportMode) {
    const isArmed = !exportMode && state.armedId === node.id;
    const parent = getParent(node);
    const preferParent = parent ? (state.armedId === parent.id) : false;
    const mouse = state.worldMouse || { x: -99999, y: -99999 };
    const overNode = !exportMode && nodeContainsWorldPoint(node, mouse.x, mouse.y);

    let hovered = false;
    let hideInterface = true;
    if (!exportMode) {
        if (overNode && !isArmed && !preferParent && !node.selectingMovement) {
            hovered = true; hideInterface = false;
        } else if (!isArmed) {
            hideInterface = !node.selectingMovement;
        } else if (isArmed) {
            hideInterface = false;
        }
    }
    node.hovered = hovered;

    if (!exportMode) {
        const boxColor = isArmed ? 'rgba(60,90,130,0.16)' : (hovered ? 'rgba(60,90,130,0.09)' : 'rgba(0,0,0,0.02)');
        const borderColor = isArmed ? 'rgba(60,90,130,0.9)' : (hovered ? 'rgba(60,90,130,0.55)' : 'rgba(0,0,0,0.15)');
        ctx.save();
        roundRect(ctx, node.pos.x, node.pos.y, node.size.width, node.size.height, Math.min(10, node.size.height * 0.2));
        ctx.fillStyle = boxColor;
        ctx.fill();
        ctx.lineWidth = isArmed ? 2 : 1;
        ctx.strokeStyle = borderColor;
        ctx.stroke();
        ctx.restore();
    }

    const isTerminal = !hasChildren(node) && !hasSubscript(node);
    const textColor = isTerminal ? state.settings.termColor : state.settings.nonTermColor;
    const fontSize = pct(2.5);
    ctx.font = `${fontSize}px ${FONT_FAMILY}`;
    ctx.fillStyle = colorToCss(textColor);
    ctx.textBaseline = 'middle';
    let textX = node.pos.x + node.size.width / 2;
    if (hasSubscript(node)) {
        ctx.font = `${pct(1.75)}px ${FONT_FAMILY}`;
        const subW = ctx.measureText(node.subscript).width;
        textX -= subW / 2;
        ctx.font = `${fontSize}px ${FONT_FAMILY}`;
    }
    const textY = node.pos.y + node.size.height / 2;
    ctx.textAlign = 'center';
    ctx.fillText(node.text, textX, textY);
    const textWidth = ctx.measureText(node.text).width;

    if (isArmed) {
        if (hiddenInput.selectionStart != hiddenInput.selectionEnd) {
            const posStart = Math.max(0, Math.min(hiddenInput.selectionStart, node.text.length));
            const posEnd = Math.max(0, Math.min(hiddenInput.selectionEnd, node.text.length));
            const selectionWidth = ctx.measureText(node.text.slice(posStart, posEnd)).width;
            const widthUntilStart = ctx.measureText(node.text.slice(0, posStart)).width;

            const leftEdge = textX - textWidth / 2;

            ctx.fillStyle = "#0033AA44"
            ctx.fillRect(leftEdge + widthUntilStart, textY - fontSize * 0.5, selectionWidth, fontSize);
        }

        const blinkRate = 48;
        state._cursorTimer = (state._cursorTimer || 0) + 1;
        if (Math.floor(state._cursorTimer / blinkRate) % 2) {
            const pos = Math.max(0, Math.min(hiddenInput.selectionStart, node.text.length));
            const widthBehindCursor = ctx.measureText(node.text.slice(0, pos)).width;
            const cursorX = (textX - textWidth / 2) + widthBehindCursor;

            ctx.fillStyle = colorToCss(textColor);
            ctx.fillText('|', cursorX + fontSize * 0.12, textY - fontSize * 0.05);
        }
    }

    if (hasSubscript(node)) {
        ctx.font = `${pct(1.75)}px ${FONT_FAMILY}`;
        ctx.fillStyle = colorToCss(state.settings.nonTermColor);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(node.subscript, textX + textWidth / 2 + pct(0.2), textY + pctH(0.75) + fontSize * 0.3);
    }

    connectToParent(node);

    if (!exportMode && !hideInterface && (!isArmed || overNode) && !node.selectingMovement && state.selectedTool === 'pointer') {
        drawNodeButtons(node);
    }

    if (node.hasMovement && node.endPointId && state.nodes.has(node.endPointId)) {
        drawMovementLine(node);
        if (node.selectingMovement) node.selectingMovement = false;
    } else if (node.hasMovement && (!node.endPointId || !state.nodes.has(node.endPointId))) {
        node.hasMovement = false;
        node.endPointId = null;
    } else if (!node.hasMovement && node.selectingMovement) {
        drawMovementLine(node);
    } else if (!node.hasMovement) {
        node.movementLineVertex = node.pos.y + node.size.height;
    }
}

function render() {
    const w = canvas.clientWidth, h = canvas.clientHeight;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    ctx.fillStyle = colorToCss(state.settings.bgColor);
    ctx.fillRect(0, 0, w, h);

    ctx.translate(w / 2 - state.camera.x * state.camera.scale, h / 2 - state.camera.y * state.camera.scale);
    ctx.scale(state.camera.scale, state.camera.scale);

    const nodes = [...state.nodes.values()];
    nodes.sort((a, b) => (a.hovered === b.hovered) ? 0 : (a.hovered ? 1 : -1));
    for (const node of nodes) drawNode(node);

    ctx.restore();

    if (state.showDebug) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
        ctx.fillStyle = '#000';
        ctx.font = '14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('Treesy web port', 8, 18);
        ctx.restore();
    }
}

function tick() {
    const nodeList = [...state.nodes.values()];
    for (const node of nodeList) {
        if (state.nodes.has(node.id)) updateNode(node);
    }

    if (state.rootId && state.nodes.has(state.rootId)) {
        alignNode(state.nodes.get(state.rootId));
    }
}

function frame() {
    tick();
    render();
    requestAnimationFrame(frame);
}

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
}

window.addEventListener('resize', resizeCanvas);

function findTopNodeAt(wx, wy) {
    const nodes = [...state.nodes.values()];
    for (let i = nodes.length - 1; i >= 0; i--) {
        if (nodeContainsWorldPoint(nodes[i], wx, wy)) return nodes[i];
    }
    return null;
}

function findButtonHit(node, wx, wy) {
    if (!node._buttons) return null;
    const { plus, leftPlus, minus, triangle, btnSize } = node._buttons;
    const hit = (p) => wx >= p.x && wx <= p.x + btnSize && wy >= p.y && wy <= p.y + btnSize;
    if (hit(plus)) return 'plus';
    if (hit(leftPlus)) return 'leftPlus';
    if (node.parentId && hit(minus)) return 'minus';
    const parent = getParent(node);
    if (state.settings.enableTriangles && parent && parent.children.length === 1 && !hasChildren(node) && hit(triangle)) return 'triangle';
    return null;
}

function disarmCurrent() {
    if (state.armedId) {
        state.armedId = null;
    }
    hiddenInput.blur();
    hiddenInput.style.display = 'none';
}

function armNode(node) {
    disarmCurrent();
    state.armedId = node.id;
    hiddenInput.style.display = 'block';
    hiddenInput.value = node.text;
    hiddenInput.focus();
    hiddenInput.setSelectionRange(node.text.length, node.text.length);
    if (node.text === 'XP') hiddenInput.select();
    state._cursorTimer = 0;
}

canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0 && e.button !== 2) return;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left, screenY = e.clientY - rect.top;
    const world = screenToWorld(screenX, screenY);
    state.worldMouse = world;

    const selectingNode = [...state.nodes.values()].find(n => n.selectingMovement);
    if (selectingNode) return;

    const node = findTopNodeAt(world.x, world.y);

    if (!node) {
        if (e.button === 0) {
            state.panning = true;
            state.lastScreen = { x: screenX, y: screenY };
        }
        return;
    }

    state.activePressNodeId = node.id;
    state.pressedInsideButton = !!findButtonHit(node, world.x, world.y);
});

window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left, screenY = e.clientY - rect.top;
    const world = screenToWorld(screenX, screenY);
    state.worldMouse = world;

    if (state.panning) {
        const dx = screenX - state.lastScreen.x;
        const dy = screenY - state.lastScreen.y;
        state.camera.x -= dx / state.camera.scale;
        state.camera.y -= dy / state.camera.scale;
        state.lastScreen = { x: screenX, y: screenY };
    }

    for (const n of state.nodes.values()) {
        if (n.selectingMovement) {
            const under = findTopNodeAt(world.x, world.y);
            n.endPointId = (under && under.id !== n.id) ? under.id : null;
        }
    }
});

window.addEventListener('mouseup', (e) => {
    if (e.button !== 0 && e.button !== 2) return;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left, screenY = e.clientY - rect.top;
    const world = screenToWorld(screenX, screenY);
    state.worldMouse = world;

    state.panning = false;

    const selectingNode = [...state.nodes.values()].find(n => n.selectingMovement);
    if (selectingNode) {
        state.activePressNodeId = null;
        state.pressedInsideButton = false;
        if (e.button === 0) {
            const target = findTopNodeAt(world.x, world.y);
            if (target && target.id !== selectingNode.id) {
                selectingNode.hasMovement = true;
                selectingNode.endPointId = target.id;
            }
        }
        selectingNode.selectingMovement = false;
        return;
    }

    const node = state.activePressNodeId ? getNode(state.activePressNodeId) : null;
    state.activePressNodeId = null;

    if (!node) return;

    const overNode = nodeContainsWorldPoint(node, world.x, world.y);
    const buttonHit = findButtonHit(node, world.x, world.y);
    const clickingButtons = state.pressedInsideButton;
    state.pressedInsideButton = false;

    if (state.selectedTool !== 'movement') {
        if (buttonHit === 'plus' && overNode && e.button === 0 && state.selectedTool === 'pointer') {
            addChildToNode(node, false);
        } else if (buttonHit === 'leftPlus' && overNode && e.button === 0 && state.selectedTool === 'pointer') {
            addChildToNode(node, true);
        } else if (buttonHit === 'minus' && node.parentId && overNode && e.button === 0 && state.selectedTool === 'pointer') {
            deleteNode(node.id);
            return;
        } else if (buttonHit === 'triangle' && e.button === 0 && state.selectedTool === 'pointer') {
            node.drawTriangle = !node.drawTriangle;
        } else if (overNode && state.selectedTool === 'subscript' && e.button === 0) {
            openSubscriptEditor(node);
        } else if (overNode && e.button === 0 && !clickingButtons) {
            armNode(node);
        }
    }

    if (overNode && e.button === 0 && state.selectedTool === 'movement') {
        if (!node.hasMovement) {
            node.selectingMovement = true;
            node.curveHeight = 0;
            node.curveAngle = 0;
        } else {
            node.hasMovement = false;
            node.endPointId = null;
        }
    }
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left, screenY = e.clientY - rect.top;

    if (e.ctrlKey || e.altKey) {
        const target = [...state.nodes.values()].find(n => n.selectingMovement);
        if (target) {
            const delta = Math.sign(-e.deltaY) || 0;
            if (e.ctrlKey) target.curveHeight += 50 * delta;
            else if (e.altKey) target.curveAngle += 0.05 * delta;
            return;
        }
    }

    const before = screenToWorld(screenX, screenY);
    const delta = Math.sign(-e.deltaY) || 0;
    const factor = 1 / ((delta * 8 + 100) / 100);
    state.camera.scale = Math.min(8, Math.max(0.05, state.camera.scale / factor));
    const after = screenToWorld(screenX, screenY);
    state.camera.x -= (after.x - before.x);
    state.camera.y -= (after.y - before.y);
}, { passive: false });

hiddenInput.addEventListener('input', () => {
    if (!state.armedId) return;
    const node = getNode(state.armedId);
    if (node) node.text = hiddenInput.value;
});

hiddenInput.addEventListener('blur', () => {
    hiddenInput.style.display = 'none';
    state.armedId = null;
});

hiddenInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        hiddenInput.blur();
    }
    e.stopPropagation();
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'F3') { state.showDebug = !state.showDebug; }
});

const subscriptModal = document.getElementById('subscript-modal');
const subscriptInput = document.getElementById('subscript-input');
const subscriptDone = document.getElementById('subscript-done');

function openSubscriptEditor(node) {
    disarmCurrent();
    state.subscriptEditId = node.id;
    subscriptInput.value = node.subscript || '';
    subscriptModal.classList.add('visible');
    subscriptInput.focus();
    subscriptInput.select();
}

function closeSubscriptEditor() {
    if (state.subscriptEditId) {
        const node = getNode(state.subscriptEditId);
        if (node) node.subscript = subscriptInput.value;
    }
    state.subscriptEditId = null;
    subscriptModal.classList.remove('visible');
}

subscriptModal.addEventListener('contextmenu', (e) => e.preventDefault());
subscriptDone.addEventListener('click', closeSubscriptEditor);
subscriptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); closeSubscriptEditor(); }
    e.stopPropagation();
});
subscriptInput.addEventListener('input', () => {
    if (state.subscriptEditId) {
        const node = getNode(state.subscriptEditId);
        if (node) node.subscript = subscriptInput.value;
    }
});

const titleModal = document.getElementById('title-modal');
const titleInput = document.getElementById('title-input');
const titleDone = document.getElementById('title-done');

function openTitleModal() {
    disarmCurrent();
    titleInput.value = state.treeTitle;
    titleModal.classList.add('visible');
    titleInput.focus();
    titleInput.select();
    state.titleModalOpen = true;
}

function closeTitleModal() {
    state.treeTitle = titleInput.value;
    titleModal.classList.remove('visible');
    state.titleModalOpen = false;
}

titleModal.addEventListener('contextmenu', (e) => e.preventDefault());
titleDone.addEventListener('click', closeTitleModal);
titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); closeTitleModal(); }
    e.stopPropagation();
});

const confirmationModal = document.getElementById('confirmation-modal');
const confirmationTitle = document.getElementById('confirmation-title');
const confirmationOkBtn = document.getElementById('confirmation-ok');
const confirmationCancelBtn = document.getElementById('confirmation-cancel');

function openConfirmationModal(title) {
    state.confirmationModalReturnValue = null;
    confirmationTitle.innerHTML = title;
    confirmationModal.classList.add('visible');
    state.confirmationModalOpen = true;
}

function closeConfirmationModal() {
    state.confirmationModalOpen = false;
    confirmationModal.classList.remove('visible');
}

confirmationModal.addEventListener('contextmenu', (e) => e.preventDefault());
confirmationOkBtn.addEventListener('click', () => {
    state.confirmationModalReturnValue = 'ok';
    closeConfirmationModal();
});
confirmationCancelBtn.addEventListener('click', () => {
    state.confirmationModalReturnValue = 'cancel';
    closeConfirmationModal();
});

const VERSION = '1.0';

function serializeTree() {
    const lines = [];
    lines.push('VERSION:' + VERSION);
    for (const node of state.nodes.values()) {
        lines.push('{');
        lines.push('id: ' + node.id);
        lines.push('pos: ' + (node.pos.x / WORLD_W * 100) + ', ' + (node.pos.y / WORLD_H * 100));
        if (node.parentId) lines.push('parent: ' + node.parentId);
        if (node.children.length) lines.push('children: ' + node.children.join(', '));
        lines.push('text: "' + (node.text || '') + '"');
        lines.push('subs: "' + (node.subscript || '') + '"');
        lines.push('hasMovement: ' + (node.hasMovement ? 'true' : 'false'));
        if (node.hasMovement && node.endPointId) lines.push('endPointNode: ' + node.endPointId);
        lines.push('curveAngle: ' + node.curveAngle);
        lines.push('curveHeight: ' + node.curveHeight);
        lines.push('triangle: ' + (node.drawTriangle ? 'true' : 'false'));
        lines.push('}');
    }
    return lines.join('\n');
}

function deserializeTree(text) {
    const lines = text.split(/\r?\n/);
    let readingNode = false;
    let block = [];
    const blocks = [];

    for (const raw of lines) {
        const line = raw;
        if (!readingNode && line.trim() === '{') { readingNode = true; block = []; }
        else if (readingNode && line.trim() === '}') { readingNode = false; blocks.push(block); }
        else if (readingNode) block.push(line);
    }

    resetTreeEmpty();

    const pendingChildren = []; // {parentId, childIds}
    const pendingEndpoints = []; // {startId, endId}
    const createdIds = new Set();

    for (const block of blocks) {
        const rec = {};
        for (const line of block) {
            const m = /^(\w+):\s*(.*)$/.exec(line.trim());
            if (!m) continue;
            rec[m[1]] = m[2];
        }
        if (!rec.id) continue;

        let posX = 50, posY = 50;
        if (rec.pos) {
            const parts = rec.pos.split(',').map(s => parseFloat(s.trim()));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) { posX = parts[0]; posY = parts[1]; }
        }

        const text = unquote(rec.text || '""');
        const subs = unquote(rec.subs || '""');

        const node = createNode(null, posX, posY, rec.id);
        node.text = text;
        node.subscript = subs;
        node.hasMovement = rec.hasMovement === 'true';
        node.curveAngle = rec.curveAngle !== undefined ? parseFloat(rec.curveAngle) : 0;
        node.curveHeight = rec.curveHeight !== undefined ? parseFloat(rec.curveHeight) : 0;
        node.drawTriangle = rec.triangle === 'true';
        createdIds.add(rec.id);

        if (rec.children) {
            const childIds = rec.children.split(',').map(s => s.trim()).filter(Boolean);
            pendingChildren.push({ parentId: rec.id, childIds });
        }
        if (node.hasMovement && rec.endPointNode) {
            pendingEndpoints.push({ startId: rec.id, endId: rec.endPointNode.trim() });
        }
        if (!rec.parent) {
            state.rootId = rec.id;
        } else {
            node.parentId = rec.parent.trim();
        }
    }

    for (const { parentId, childIds } of pendingChildren) {
        const parent = getNode(parentId);
        if (!parent) continue;
        for (const cid of childIds) {
            if (state.nodes.has(cid)) parent.children.push(cid);
        }
    }

    for (const { startId, endId } of pendingEndpoints) {
        const startNode = getNode(startId);
        if (startNode && state.nodes.has(endId)) startNode.endPointId = endId;
        else if (startNode) startNode.hasMovement = false;
    }

    if (!state.rootId || !state.nodes.has(state.rootId)) {
        const fallback = [...state.nodes.values()].find(n => !n.parentId);
        state.rootId = fallback ? fallback.id : null;
    }

    if (state.nodes.size === 0) {
        resetTree();
    }
}

function unquote(s) {
    const m = /^"([\s\S]*)"$/.exec(s.trim());
    return m ? m[1] : s;
}

function resetTreeEmpty() {
    state.nodes.clear();
    state.armedId = null;
    state.subscriptEditId = null;
    state.activePressNodeId = null;
    state.hoverNodeId = null;
    state.rootId = null;
}

function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function exportPNG() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of state.nodes.values()) {
        minX = Math.min(minX, node.pos.x);
        minY = Math.min(minY, node.pos.y);
        maxX = Math.max(maxX, node.pos.x + node.size.width);
        maxY = Math.max(maxY, node.pos.y + node.size.height, node.movementLineVertex);
    }
    if (!isFinite(minX)) return;

    const margin = pct(2);
    minX -= margin; minY -= margin; maxX += margin; maxY += margin;
    const w = Math.max(10, maxX - minX), h = Math.max(10, maxY - minY);

    const off = document.createElement('canvas');
    off.width = Math.round(w);
    off.height = Math.round(h);
    const octx = off.getContext('2d');

    octx.fillStyle = colorToCss(state.settings.bgColor);
    octx.fillRect(0, 0, off.width, off.height);
    octx.translate(-minX, -minY);

    const prevCtx = ctx;
    ctx = octx;
    const nodes = [...state.nodes.values()];
    for (const node of nodes) drawNode(node, true);
    ctx = prevCtx;

    off.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; 
        a.download = state.treeTitle + '.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

const btnNew = document.getElementById('btn-new');
const btnOpen = document.getElementById('btn-open');
const btnSave = document.getElementById('btn-save');
const btnExport = document.getElementById('btn-export');
const btnSettings = document.getElementById('btn-settings');
const btnAbout = document.getElementById('btn-about');
const fileInput = document.getElementById('file-input');
const btnReset = document.getElementById('settings-default');
const settingsPanel = document.getElementById('settings-panel');
const settingsClose = document.getElementById('settings-close');
const aboutPanel = document.getElementById('about-panel');
const aboutClose = document.getElementById('about-close');

btnNew.addEventListener('click', async () => {
    openConfirmationModal('Start a new tree? This will erase the current one.');
    while (state.confirmationModalOpen) await sleep(100);

    if (state.confirmationModalReturnValue === 'ok') {
        resetTree();
        openTitleModal();
    }
});

btnOpen.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => deserializeTree(String(reader.result));
    reader.readAsText(file);
    fileInput.value = '';

    const fileName = file.name.split('.')[0];
    if (fileName) state.treeTitle = fileName;
});

btnSave.addEventListener('click', async () => {
    if (state.treeTitle === 'NewTree') {
        openTitleModal();
        while (state.titleModalOpen) await sleep(100);
    }
    downloadTextFile(state.treeTitle + '.treesy', serializeTree());
});

btnExport.addEventListener('click', async () => {
    if (state.treeTitle === 'NewTree') {
        openTitleModal();
        while (state.titleModalOpen) await sleep(100);
    }
    exportPNG();
});

btnSettings.addEventListener('click', () => {
    settingsPanel.classList.toggle('visible');
    aboutPanel.classList.remove('visible');
});
settingsClose.addEventListener('click', () => settingsPanel.classList.remove('visible'));

// settings controls
const horzSlider = document.getElementById('horz-spacing');
const termLinesToggle = document.getElementById('term-lines-toggle');

horzSlider.addEventListener('input', () => {
    state.settings.horzSpacing = parseFloat(horzSlider.value);
});
horzSlider.addEventListener('settingsReset', () => horzSlider.value = state.settings.horzSpacing);

termLinesToggle.addEventListener('change', () => {
    state.settings.showTermLines = termLinesToggle.checked;
});
termLinesToggle.addEventListener('settingsReset', () => termLinesToggle.checked = state.settings.showTermLines);

function wireColorControl(key, colorInputId, alphaInputId) {
    const colorInput = document.getElementById(colorInputId);
    colorInput.value = colorToHex(state.settings[key]);

    colorInput.addEventListener('input', () => {
        const { r, g, b } = hexToRgb(colorInput.value);
        state.settings[key].r = r; state.settings[key].g = g; state.settings[key].b = b;
    });

    colorInput.addEventListener('settingsReset', () => colorInput.value = colorToHex(state.settings[key]));
}

wireColorControl('bgColor', 'bg-color');
wireColorControl('lineColor', 'line-color');
wireColorControl('nonTermColor', 'nonterm-color');
wireColorControl('termColor', 'term-color');

// wire bg alpha
const alphaInput = document.getElementById('bg-alpha');
alphaInput.value = state.settings['bgColor'].a;
alphaInput.addEventListener('input', () => {
    state.settings['bgColor'].a = parseInt(alphaInput.value, 10);
});
alphaInput.addEventListener('settingsReset', () => alphaInput.value = state.settings['bgColor'].a);

// default settings button
const resetSettingsEvent = new Event('settingsReset');
btnReset.addEventListener('click', () => {
    state.settings = DEFAULT_SETTINGS();

    const panelBody = document.querySelector('.panel-body');
    panelBody.querySelectorAll('input').forEach(el => {
        el.dispatchEvent(resetSettingsEvent);
    });
});

// about panel 
btnAbout.addEventListener('click', () => {
    aboutPanel.classList.toggle('visible');
    settingsPanel.classList.remove('visible');
});
aboutClose.addEventListener('click', () => aboutPanel.classList.remove('visible'));

// wire tool buttons
function modifyProperty(id, from, to) {
    document.getElementById(id).style.setProperty(from, window.getComputedStyle(document.body).getPropertyValue(to));
}

const buttonIds = ['btn-pointer', 'btn-subscript', 'btn-movement'];
for (const id of buttonIds) {
    const button = document.getElementById(id);
    button.addEventListener('click', () => {
        state.selectedTool = id.split('-')[1];

        modifyProperty(id, '--panel', '--accent');
        modifyProperty(id, '--muted', '--paper');
        for (const otherId of buttonIds) {
            if (otherId !== id) {
                modifyProperty(otherId, '--panel', '--panel');
                modifyProperty(otherId, '--muted', '--muted');
            }
        }
    });
}

modifyProperty('btn-pointer', '--panel', '--accent');
modifyProperty('btn-pointer', '--muted', '--paper');


const hintDismiss = document.getElementById('hint-dismiss');
if (hintDismiss) hintDismiss.addEventListener('click', () => hintBar.classList.add('hidden'));

function init() {
    resizeCanvas();
    resetTree();
    state.camera.scale = canvas.clientWidth / WORLD_W;
    state.camera.x = WORLD_W / 2;
    state.camera.y = pctH(68);

    requestAnimationFrame(frame);
}

init();

})();
