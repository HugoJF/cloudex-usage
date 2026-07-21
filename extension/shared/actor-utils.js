import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {requireCallback, requireDataRole, requireId, requireText} from './presentation-validation.js';

export function box(styleClass, orientation = Clutter.Orientation.HORIZONTAL,
    properties = {}) {
    return new St.BoxLayout({style_class: styleClass, orientation, ...properties});
}

export function column(styleClass, properties = {}) {
    return box(styleClass, Clutter.Orientation.VERTICAL, properties);
}

export function label(text, styleClass, properties = {}) {
    return new St.Label({text: requireText(text, 'Label'), style_class: styleClass,
        y_align: Clutter.ActorAlign.CENTER, ...properties});
}

export function button({id, text, styleClass, accessibleName, onActivate,
    toggleMode = false, checked = false}) {
    requireId(id, 'Button');
    requireCallback(onActivate, 'Button activation');
    const actor = new St.Button({name: id, style_class: styleClass, can_focus: true,
        reactive: true, track_hover: true, toggle_mode: toggleMode, checked,
        child: label(text, 'claudex-button-label')});
    actor.set_accessible_name(requireText(accessibleName, 'Button accessible name'));
    actor.connect('clicked', onActivate);
    return actor;
}

export function providerIcon({path, size, styleClass, accessibleName}) {
    const actor = new St.Icon({style_class: styleClass,
        gicon: new Gio.FileIcon({file: Gio.File.new_for_path(requireText(path, 'Icon path'))}),
        icon_size: size, y_align: Clutter.ActorAlign.CENTER});
    actor.set_accessible_name(requireText(accessibleName, 'Icon accessible name'));
    return actor;
}

export function dataStyle(dataRole, tokens) {
    const color = requireDataRole(dataRole, tokens);
    return `background-color: ${color}; color: ${color};`;
}
