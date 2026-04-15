import { EMOJI_ASSETS, THINKING_PNG, INLOVE_PNG } from '../emojis';

export type MascotState =
	| 'idle'
	| 'thinking'
	| 'blink'
	| 'inlove'
	| 'badass'
	| 'confused'
	| 'challenged'
	| 'sad'
	| 'cry'
	| 'angry';

/** States that display the soul's own emoji as plain text. */
const TEXT_STATES = new Set<MascotState>(['idle', 'blink']);

/** Map from non-text state → emoji character whose PNG to show. */
const STATE_EMOJI: Partial<Record<MascotState, string>> = {
	thinking:   '🤔',
	confused:   '🤔',
	challenged: '🤔',
	inlove:     '❤️‍🔥',
	badass:     '😏',
	sad:        '😕',
	cry:        '😕',
	angry:      '👺',
};

/**
 * Creates an animated mascot inside `container`.
 *
 * - **Idle / blink**: renders the soul's emoji as plain text.
 * - **All other states**: renders the corresponding animated PNG.
 *
 * Returns:
 * - `setState(state)` — switch expression.
 * - `setEmoji(emoji)` — update the soul emoji shown in idle/blink states.
 */
export function createMascotImg(
	container: HTMLElement,
	initialState: MascotState,
	cls = 'agent-mascot-img',
	initialEmoji = '✨',
): { el: HTMLElement; setState: (state: MascotState) => void; setEmoji: (emoji: string) => void } {
	const wrap = container.createDiv({ cls });

	// Text element — shown in idle/blink states
	const emojiSpan = wrap.createEl('span', {
		cls: 'agent-mascot-emoji-text',
		text: initialEmoji,
	});

	// Image element — shown in all other states
	const img = wrap.createEl('img', {
		cls: 'agent-mascot-png',
		attr: { alt: '', draggable: 'false' },
	});

	let currentState: MascotState = initialState;
	let currentEmoji = initialEmoji;

	function applyState(state: MascotState): void {
		if (TEXT_STATES.has(state)) {
			emojiSpan.style.display = '';
			img.style.display = 'none';
		} else {
			// Use the soul's own animated PNG if it exists in the curated set;
			// otherwise fall back to the state-specific emoji (e.g. wizard has no soul emoji).
			const emojiChar = EMOJI_ASSETS[currentEmoji] ? currentEmoji : (STATE_EMOJI[state] ?? '🤔');
			const src = EMOJI_ASSETS[emojiChar] ?? THINKING_PNG;
			img.setAttribute('src', src);
			emojiSpan.style.display = 'none';
			img.style.display = '';
		}
	}

	// Preload inlove PNG so it renders instantly when needed
	const preloadInlove = new Image();
	preloadInlove.src = INLOVE_PNG;

	applyState(initialState);

	return {
		el: wrap,
		setState(state: MascotState) {
			if (state === currentState) return;
			currentState = state;
			applyState(state);
		},
		setEmoji(emoji: string) {
			currentEmoji = emoji;
			emojiSpan.setText(emoji);
			// If already in a non-text state, update the displayed PNG immediately
			if (!TEXT_STATES.has(currentState)) {
				applyState(currentState);
			}
		},
	};
}
