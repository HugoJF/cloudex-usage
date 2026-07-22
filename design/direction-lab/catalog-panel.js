import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

function box(styleClass, properties = {}) {
    return new St.BoxLayout({style_class: styleClass,
        orientation: Clutter.Orientation.HORIZONTAL, ...properties});
}

function panelIcon({path, accessibleName, tokens}) {
    const actor = new St.Icon({style_class: 'cloudex-panel-provider-icon',
        gicon: new Gio.FileIcon({file: Gio.File.new_for_path(path)}),
        icon_size: tokens.size.panelProviderIcon,
        y_align: Clutter.ActorAlign.CENTER});
    actor.set_accessible_name(accessibleName);
    return actor;
}

function panelValue(text, muted, tokens) {
    return new St.Label({text, style_class: 'cloudex-panel-value',
        y_align: Clutter.ActorAlign.CENTER,
        ...(muted ? {style: `color: ${tokens.color.foregroundMuted};`} : {})});
}

export function updateCatalogPanelIcons(actor, extensionPath, lightPanel) {
    const providers = ['claude', 'codex'];
    const groups = actor.get_children().filter(child =>
        child.has_style_class_name?.('cloudex-panel-provider'));
    groups.forEach((group, index) => {
        const suffix = lightPanel ? '-light' : '';
        group.get_first_child().gicon = new Gio.FileIcon({
            file: Gio.File.new_for_path(
                `${extensionPath}/icons/${providers[index]}${suffix}.svg`),
        });
    });
}

export function buildCatalogPanel({extensionPath, tokens, lightPanel}) {
    const actor = box('cloudex-panel',
        {name: 'refinement-panel'});
    const iconPath = provider =>
        `${extensionPath}/icons/${provider}${lightPanel ? '-light' : ''}.svg`;
    const claude = box('cloudex-panel-provider');
    claude.add_child(panelIcon({path: iconPath('claude'),
        accessibleName: 'Claude mark, 5-hour 8 percent used, weekly 68 percent used',
        tokens}));
    claude.add_child(panelValue('8%', true, tokens));
    claude.add_child(panelValue('·', false, tokens));
    claude.add_child(panelValue('68%', false, tokens));
    actor.add_child(claude);
    actor.add_child(new St.Widget({style_class: 'cloudex-panel-provider-divider',
        width: 1, height: 12}));
    const codex = box('cloudex-panel-provider');
    codex.add_child(panelIcon({path: iconPath('codex'),
        accessibleName: 'Codex mark, weekly 42 percent used', tokens}));
    codex.add_child(panelValue('42%', false, tokens));
    actor.add_child(codex);
    return actor;
}
