import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

Gio._promisify(Shell.Screenshot.prototype, 'screenshot_area',
    'screenshot_area_finish');

const CAPTURE_ATTEMPTS = 60;
const CAPTURE_RETRY_MS = 80;
const DEFAULT_PADDING_PX = 8;

function captureDirectory() {
    const override = GLib.getenv('CLOUDEX_CAPTURE_DIR');
    if (override)
        {return Gio.File.new_for_path(override);}
    return Gio.File.new_for_uri(import.meta.url).get_parent().get_parent()
        .get_parent().get_child('design').get_child('captures');
}

function directGeometry(actor) {
    const [x, y] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    if (Number.isFinite(x) && Number.isFinite(y) && width > 0 && height > 0)
        {return {x, y, width, height};}
    if (Number.isFinite(x) && Number.isFinite(y) &&
        actor.width > 0 && actor.height > 0)
        {return {x, y, width: actor.width, height: actor.height};}
    return null;
}

function allocationGeometry(actor) {
    let child = actor;
    let ancestor = child.get_parent();
    let offsetX = child.x;
    let offsetY = child.y;
    while (ancestor) {
        const [x, y] = ancestor.get_transformed_position();
        if (Number.isFinite(x) && Number.isFinite(y) &&
            actor.width > 0 && actor.height > 0)
            {return {x: x + offsetX, y: y + offsetY,
                width: actor.width, height: actor.height};}
        child = ancestor;
        ancestor = child.get_parent();
        offsetX += child.x;
        offsetY += child.y;
    }
    return null;
}

function fixedGeometry(bounds, padding) {
    return {
        x: global.screen_width - bounds.width - padding -
            (bounds.leftOffset ?? 0),
        y: padding + (bounds.topOffset ?? 0),
        width: bounds.width,
        height: bounds.height,
    };
}

function geometryFor(actor, model) {
    if (model.fixedTopRight)
        {return fixedGeometry(model.fixedTopRight, model.padding);}
    const direct = directGeometry(actor);
    if (direct || !model.useAllocation)
        {return direct;}
    return allocationGeometry(actor);
}

async function waitForGeometry(model) {
    const getActor = typeof model.target === 'function'
        ? model.target
        : () => model.target;
    for (let attempt = 0; attempt < CAPTURE_ATTEMPTS; attempt++) {
        const actor = getActor();
        if (actor?.is_mapped()) {
            const geometry = geometryFor(actor, model);
            if (geometry)
                {return {actor, geometry};}
        }
        await Scripting.sleep(CAPTURE_RETRY_MS);
    }
    return {actor: getActor(), geometry: null};
}

function captureBounds(geometry, padding) {
    const x = Math.max(0, Math.floor(geometry.x - padding));
    const y = Math.max(0, Math.floor(geometry.y - padding));
    return {
        x,
        y,
        width: Math.min(global.screen_width - x,
            Math.ceil(geometry.width + padding * 2)),
        height: Math.min(global.screen_height - y,
            Math.ceil(geometry.height + padding * 2)),
    };
}

export async function captureActor({target, filename,
    padding = DEFAULT_PADDING_PX, useAllocation = false,
    fixedTopRight = null, assert}) {
    const model = {target, padding, useAllocation, fixedTopRight};
    const {actor, geometry} = await waitForGeometry(model);
    assert(actor?.is_mapped(), `${filename} actor is not mapped`);
    assert(geometry, `${filename} actor has no allocated geometry`);
    const directory = captureDirectory();
    if (!directory.query_exists(null))
        {directory.make_directory_with_parents(null);}
    const {x, y, width, height} = captureBounds(geometry, padding);
    const stream = directory.get_child(filename).replace(null, false,
        Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    const screenshot = new Shell.Screenshot();
    await screenshot.screenshot_area(x, y, width, height, stream);
    stream.close(null);
}
