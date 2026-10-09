import test from 'node:test';
import assert from 'node:assert/strict';
import { buttonVariants, buttonVisualState, controlSizes } from '../src/ui.mjs';

test('all variants retain geometry on focus and give selected hover/press feedback', () => {
  assert.deepEqual(buttonVariants, ['primary', 'secondary', 'ghost', 'destructive']);
  for (const variant of buttonVariants) {
    const base = buttonVisualState({variant});
    const focus = buttonVisualState({variant, focused:true});
    assert.equal(focus.container.borderWidth, base.container.borderWidth, `${variant}: focus must not shift layout`);
    assert.equal(focus.container.outlineWidth, 3);
    assert.equal(focus.container.outlineOffset, 3);
    const selected = buttonVisualState({variant, selected:true});
    const hover = buttonVisualState({variant, selected:true, hovered:true});
    const press = buttonVisualState({variant, selected:true, pressed:true});
    assert.notEqual(hover.container.backgroundColor, selected.container.backgroundColor);
    assert.notEqual(press.container.backgroundColor, hover.container.backgroundColor);
    assert.deepEqual(buttonVisualState({variant, disabled:true, pressed:true, hovered:true}), buttonVisualState({variant, disabled:true}));
  }
  assert.ok(Object.values(controlSizes).every(size => size >= 44));
  assert.notEqual(buttonVisualState({selected:true}).container.backgroundColor, buttonVisualState({variant:'primary'}).container.backgroundColor, 'selection differs from an imperative primary action');
});
