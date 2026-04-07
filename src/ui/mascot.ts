/** SVG face states available in the rendered avatar. */
type FaceState = 'idle' | 'thinking' | 'talking' | 'happy' | 'wink' | 'sad';

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

const STATE_MAP: Record<MascotState, FaceState> = {
	idle:       'idle',
	thinking:   'thinking',
	blink:      'wink',
	inlove:     'happy',
	badass:     'wink',
	confused:   'thinking',
	challenged: 'thinking',
	sad:        'sad',
	cry:        'sad',
	angry:      'sad',
};

let _counter = 0;

function buildSvg(id: number): string {
	const p = `mf${id}`;
	return `<svg class="agent-face-svg" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="14" cy="14" r="14" fill="var(--interactive-accent)"/>

  <g id="${p}-idle">
    <ellipse cx="10" cy="13" rx="1.8" ry="2.1" fill="rgba(255,255,255,.9)" style="transform-origin:10px 13px;animation:agent-blink 3.2s ease-in-out infinite"/>
    <ellipse cx="18" cy="13" rx="1.8" ry="2.1" fill="rgba(255,255,255,.9)" style="transform-origin:18px 13px;animation:agent-blink 3.2s .1s ease-in-out infinite"/>
    <circle cx="10.4" cy="13.3" r=".9" fill="rgba(0,0,0,.55)"/>
    <circle cx="18.4" cy="13.3" r=".9" fill="rgba(0,0,0,.55)"/>
    <path d="M10.5 18 Q14 20.5 17.5 18" stroke="rgba(255,255,255,.85)" stroke-width="1.3" stroke-linecap="round" fill="none"/>
  </g>

  <g id="${p}-thinking" style="display:none">
    <ellipse cx="10" cy="13" rx="1.8" ry="2.1" fill="rgba(255,255,255,.9)"/>
    <ellipse cx="18" cy="13" rx="1.8" ry="2.1" fill="rgba(255,255,255,.9)"/>
    <circle cx="9.6" cy="12.4" r=".9" fill="rgba(0,0,0,.55)" style="animation:agent-think-dart 1.4s ease-in-out infinite"/>
    <circle cx="17.6" cy="12.4" r=".9" fill="rgba(0,0,0,.55)" style="animation:agent-think-dart 1.4s .07s ease-in-out infinite"/>
    <path d="M10.5 18.5 Q12.5 17.5 14 18.5 Q15.5 19.5 17.5 18.5" stroke="rgba(255,255,255,.7)" stroke-width="1.2" stroke-linecap="round" fill="none"/>
    <g style="transform-origin:14px 14px;animation:agent-spin-ring 1.6s linear infinite">
      <circle cx="14" cy="3.5" r="1.2" fill="rgba(255,255,255,.5)"/>
    </g>
    <g style="transform-origin:14px 14px;animation:agent-spin-ring 1.6s .53s linear infinite">
      <circle cx="14" cy="3.5" r=".8" fill="rgba(255,255,255,.3)"/>
    </g>
  </g>

  <g id="${p}-talking" style="display:none">
    <ellipse cx="10" cy="13" rx="1.8" ry="2.0" fill="rgba(255,255,255,.9)"/>
    <ellipse cx="18" cy="13" rx="1.8" ry="2.0" fill="rgba(255,255,255,.9)"/>
    <circle cx="10.4" cy="13.2" r=".9" fill="rgba(0,0,0,.55)"/>
    <circle cx="18.4" cy="13.2" r=".9" fill="rgba(0,0,0,.55)"/>
    <ellipse cx="14" cy="18.5" rx="2.4" ry="1.6" fill="rgba(0,0,0,.35)" style="transform-origin:14px 18.5px;animation:agent-mouth-talk .5s ease-in-out infinite"/>
    <path d="M11.6 18.5 Q14 20.5 16.4 18.5" stroke="rgba(255,255,255,.85)" stroke-width="1.2" stroke-linecap="round" fill="none"/>
  </g>

  <g id="${p}-happy" style="display:none">
    <path d="M8.4 13 Q10 11.4 11.6 13" stroke="rgba(255,255,255,.9)" stroke-width="1.6" stroke-linecap="round" fill="none"/>
    <path d="M16.4 13 Q18 11.4 19.6 13" stroke="rgba(255,255,255,.9)" stroke-width="1.6" stroke-linecap="round" fill="none"/>
    <path d="M9.5 17.5 Q14 22 18.5 17.5" stroke="rgba(255,255,255,.9)" stroke-width="1.5" stroke-linecap="round" fill="none"/>
  </g>

  <g id="${p}-wink" style="display:none">
    <ellipse cx="10" cy="13" rx="1.8" ry="2.1" fill="rgba(255,255,255,.9)" style="transform-origin:10px 13px;animation:agent-blink 3.2s ease-in-out infinite"/>
    <circle cx="10.4" cy="13.3" r=".9" fill="rgba(0,0,0,.55)"/>
    <path d="M16.4 13 Q18 11.4 19.6 13" stroke="rgba(255,255,255,.9)" stroke-width="1.6" stroke-linecap="round" fill="none"/>
    <path d="M10.5 18 Q14 20.5 17.5 18" stroke="rgba(255,255,255,.85)" stroke-width="1.3" stroke-linecap="round" fill="none"/>
  </g>

  <g id="${p}-sad" style="display:none">
    <ellipse cx="10" cy="13.5" rx="1.8" ry="1.8" fill="rgba(255,255,255,.9)"/>
    <ellipse cx="18" cy="13.5" rx="1.8" ry="1.8" fill="rgba(255,255,255,.9)"/>
    <circle cx="10.4" cy="14" r=".9" fill="rgba(0,0,0,.55)"/>
    <circle cx="18.4" cy="14" r=".9" fill="rgba(0,0,0,.55)"/>
    <path d="M10.5 19.5 Q14 17 17.5 19.5" stroke="rgba(255,255,255,.85)" stroke-width="1.3" stroke-linecap="round" fill="none"/>
  </g>
</svg>`;
}

/**
 * Creates an animated SVG avatar face inside `container`.
 * Returns a `setState` function to switch expressions.
 */
export function createMascotImg(
	container: HTMLElement,
	initialState: MascotState,
	cls = 'agent-mascot-img',
): { el: HTMLElement; setState: (state: MascotState) => void } {
	const id = _counter++;
	const wrap = container.createDiv({ cls });
	wrap.innerHTML = buildSvg(id);

	const p = `mf${id}`;
	const groups = {
		idle:     wrap.querySelector<HTMLElement>(`#${p}-idle`)!,
		thinking: wrap.querySelector<HTMLElement>(`#${p}-thinking`)!,
		talking:  wrap.querySelector<HTMLElement>(`#${p}-talking`)!,
		happy:    wrap.querySelector<HTMLElement>(`#${p}-happy`)!,
		wink:     wrap.querySelector<HTMLElement>(`#${p}-wink`)!,
		sad:      wrap.querySelector<HTMLElement>(`#${p}-sad`)!,
	};

	let current: FaceState = STATE_MAP[initialState];
	for (const [k, el] of Object.entries(groups)) {
		el.style.display = k === current ? '' : 'none';
	}

	return {
		el: wrap,
		setState(state: MascotState) {
			const next = STATE_MAP[state];
			if (next === current) return;
			for (const [k, el] of Object.entries(groups)) {
				el.style.display = k === next ? '' : 'none';
			}
			current = next;
		},
	};
}
