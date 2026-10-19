import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import { Dimensions, Text } from 'react-native';
import { getAnimatedStyle, setUpTests } from 'react-native-reanimated';

import { Sheet } from './Sheet';

let mockReducedMotion = false;
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual<Record<string, unknown>>('react-native-reanimated');
  return new Proxy(actual, { get: (target, key) => (key === 'useReducedMotion' ? () => mockReducedMotion : target[key as string]) });
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

setUpTests();
beforeEach(() => { jest.useFakeTimers(); mockReducedMotion = false; });
afterEach(() => { jest.useRealTimers(); });

const FRAME_MS = 16;

type TreeNode = { props: Record<string, unknown>; parent: TreeNode | null };
// Reanimated's web typings declare getAnimatedStyle() without parameters; the native one takes the component.
const animatedStyleOf = getAnimatedStyle as unknown as (component: TreeNode) => { transform?: { translateY?: number }[] };

/** The sheet's vertical offset from its resting place (positive = below it). */
const offsetOf = (panel: TreeNode): number => {
  const transform = animatedStyleOf(panel).transform;
  return transform?.find((t) => t.translateY !== undefined)?.translateY ?? 0;
};

/** The sheet panel: the modal container around the content. */
const modalAncestor = (el: TreeNode): TreeNode => {
  let node: TreeNode | null = el;
  while (node && !node.props.accessibilityViewIsModal) node = node.parent;
  if (!node) throw new Error('no modal sheet panel around the content');
  return node;
};

describe('Sheet opening motion', () => {
  it('slides up from below and settles at its place without flying past it', async () => {
    const screen = await render(
      <Sheet visible>
        <Text>Sheet content</Text>
      </Sheet>,
    );
    const panel = modalAncestor(screen.getByText('Sheet content'));
    const windowHeight = Dimensions.get('window').height;
    const samples: { t: number; y: number }[] = [{ t: 0, y: offsetOf(panel) }];
    for (let t = FRAME_MS; t <= 3000; t += FRAME_MS) {
      await act(async () => { jest.advanceTimersByTime(FRAME_MS); });
      samples.push({ t, y: offsetOf(panel) });
    }

    // Starts below its place, about a window height away.
    expect(samples[0].y).toBeGreaterThan(windowHeight * 0.9);
    // Overshoot above its place stays small.
    const overshoot = -Math.min(...samples.map((s) => s.y));
    expect(overshoot).toBeLessThanOrEqual(windowHeight * 0.08);
    // At rest within 1.5s, and stays there.
    const late = samples.filter((s) => s.t >= 1500);
    expect(late.every((s) => Math.abs(s.y) < 1)).toBe(true);
  });

  it('appears at its place immediately with reduced motion', async () => {
    mockReducedMotion = true;
    const screen = await render(
      <Sheet visible>
        <Text>Sheet content</Text>
      </Sheet>,
    );
    expect(Math.abs(offsetOf(modalAncestor(screen.getByText('Sheet content'))))).toBeLessThan(1);
  });
});
