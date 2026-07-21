import Clutter from 'gi://Clutter';
import St from 'gi://St';

/** @typedef {{active: boolean, tokens: object}} SwitchProps */
/** @param {SwitchProps} props */
export function Switch({active, tokens}) {
    if (typeof active !== 'boolean')
        {throw new Error('Switch active state must be boolean');}
    const actor = new St.Widget({style_class: `claudex-switch${active ? ' active' : ''}`,
        layout_manager: new Clutter.FixedLayout(), width: tokens.size.switchTrackWidth,
        height: tokens.size.switchTrackHeight, y_align: Clutter.ActorAlign.CENTER,
        y_expand: false, reactive: false});
    actor.add_child(new St.Widget({style_class: 'claudex-switch-knob',
        width: tokens.size.switchThumb, height: tokens.size.switchThumb,
        x: active ? tokens.size.switchTrackWidth - tokens.size.switchThumb -
            tokens.size.switchInset : tokens.size.switchInset,
        y: tokens.size.switchInset, reactive: false}));
    return actor;
}
