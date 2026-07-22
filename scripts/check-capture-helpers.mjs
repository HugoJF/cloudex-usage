import {copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

export const CATALOG_CAPTURES = Object.freeze([
    'catalog-panel-dark-100.png', 'catalog-popup-dark-100.png',
    'catalog-settings-dark-100.png', 'catalog-panel-disabled.png',
    'catalog-panel-light-100.png', 'catalog-panel-dark-200.png',
]);
export const SURFACE_CAPTURES = Object.freeze([
    'surface-panel-dark-100.png', 'surface-popup-dark-100.png',
    'surface-refresh-focus-hover.png', 'surface-unavailable-popup.png',
    'surface-panel-light-100.png', 'surface-panel-dark-200.png',
    'surface-settings-dark-100.png',
    'surface-settings-toggle-off-focus-hover.png',
    'surface-settings-cadence-focus-hover.png',
    'surface-settings-light-100.png', 'surface-left-popup-dark-100.png',
    'surface-history-stepper-dark-100.png',
    'surface-history-stepper-light-100.png',
    'surface-history-stepper-dark-200.png',
]);

export function replaceExactly(file, before, after) {
    const source = readFileSync(file, 'utf8');
    if (source.split(before).length !== 2)
        {throw new Error(`Expected one replacement in ${file}`);}
    writeFileSync(file, source.replace(before, after));
}

export function prepareProductionVariant(model) {
    cpSync(path.join(model.root, 'extension'), model.sourceDir, {recursive: true});
    copyFileSync(path.join(model.root, 'design/system/tokens.json'),
        path.join(model.sourceDir, 'tokens.json'));
    cpSync(path.join(model.root, 'design/direction-lab/icons'),
        path.join(model.sourceDir, 'icons'), {recursive: true});
    model.edits(model.sourceDir);
    model.run('gnome-extensions', ['pack', '--force',
        '--schema=schemas/org.gnome.shell.extensions.cloudex-usage.gschema.xml',
        '--extra-source=surface-controller.js',
        '--extra-source=panel-preferences.js', '--extra-source=codex-contract.js',
        '--extra-source=codex-runtime.js', '--extra-source=claude-contract.js',
        '--extra-source=claude-runtime.js', '--extra-source=history-store.js',
        '--extra-source=history-runtime.js', '--extra-source=controller-snapshot.js',
        '--extra-source=controller-validation.js', '--extra-source=panel-view.js',
        '--extra-source=history-view.js', '--extra-source=usage-view.js',
        '--extra-source=settings-view.js', '--extra-source=load-tokens.js',
        '--extra-source=temporal.js', '--extra-source=shared',
        '--extra-source=tokens.json', '--extra-source=icons',
        '--out-dir', model.packageDir, model.sourceDir]);
    return path.join(model.packageDir,
        'cloudex-usage@hugo.local.shell-extension.zip');
}

function comparableImage(filename, filePath) {
    if (filename.includes('panel'))
        {return [filePath];}
    if (filename === 'surface-history-stepper-dark-200.png')
        {return ['(', filePath, '-crop', '856x266+8+21', '+repage', ')'];}
    return ['(', filePath, '-crop', '99999x99999+0+5', '+repage', ')'];
}

export function assertCaptures(model) {
    for (const filename of model.captures) {
        const captured = path.join(model.captureDir, filename);
        const bytes = readFileSync(captured);
        if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
            bytes.length < 256)
            {throw new Error(`${filename} is not a non-empty PNG capture`);}
        if (!model.compareCanonical)
            {continue;}
        const canonical = path.join(model.root, 'design/captures', filename);
        const result = spawnSync('compare', ['-metric', 'AE',
            ...comparableImage(filename, canonical),
            ...comparableImage(filename, captured), 'null:'],
        {cwd: model.root, encoding: 'utf8'});
        if (result.error)
            {throw result.error;}
        const absoluteError = Number.parseFloat(result.stderr);
        if (result.status !== 0 || absoluteError !== 0)
            {throw new Error(`${filename} differs by ${absoluteError} pixels`);}
    }
    const comparison = model.compareCanonical ? ' and pixel-identical' : '';
    process.stdout.write(`${model.label} captures: ${model.captures.length} verified` +
        `${comparison}\n`);
}

export function writeSharedConsumer(root, sourceDir, journeyPath) {
    cpSync(path.join(root, 'tests/fixtures/shared-proof'), sourceDir,
        {recursive: true});
    mkdirSync(path.join(sourceDir, 'shared'), {recursive: true});
    cpSync(path.join(root, 'extension/shared'), path.join(sourceDir, 'shared'),
        {recursive: true});
    copyFileSync(path.join(root, 'design/system/tokens.json'),
        path.join(sourceDir, 'tokens.json'));
    copyFileSync(path.join(root, 'design/direction-lab/stylesheet.css'),
        path.join(sourceDir, 'stylesheet.css'));
    copyFileSync(path.join(root, 'tests/gjs/shared-proof.journey.js'), journeyPath);
}
