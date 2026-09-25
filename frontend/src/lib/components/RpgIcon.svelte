<script lang="ts">
	let { name, size = 28, title }: { name: string; size?: number; title?: string } = $props();
	const stroke = 'currentColor';
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 32 32"
	fill="none"
	{stroke}
	stroke-width="1.7"
	stroke-linecap="round"
	stroke-linejoin="round"
	role={title ? 'img' : 'presentation'}
	aria-label={title}
	aria-hidden={title ? undefined : 'true'}
>
	{#if name === 'd4'}<path d="M16 3 29 27H3L16 3Z" /><path d="m16 3 0 24M3 27l13-8 13 8" />
	{:else if name === 'd6'}<path d="m16 3 12 7v13l-12 6-12-6V10l12-7Z" /><path
			d="m4 10 12 7 12-7M16 17v12"
		/><circle cx="11" cy="10" r=".8" fill={stroke} /><circle
			cx="21"
			cy="10"
			r=".8"
			fill={stroke}
		/><circle cx="16" cy="23" r=".8" fill={stroke} />
	{:else if name === 'd8'}<path d="m16 3 12 8-4 15-8 3-8-3-4-15 12-8Z" /><path
			d="m16 3-6 11 6 15 6-15-6-11ZM4 11l12 3 12-3M8 26l8-12 8 12"
		/>
	{:else if name === 'd10'}<path d="m16 3 12 9-5 15H9L4 12l12-9Z" /><path
			d="m16 3 0 24M4 12l12 5 12-5M9 27l7-10 7 10"
		/>
	{:else if name === 'd12'}<path d="m16 3 9 4 5 9-5 9-9 4-9-4-5-9 5-9 9-4Z" /><path
			d="m16 3-5 12 5 14 5-14-5-12ZM2 16h28M7 7l4 8-6 10M25 7l-4 8 6 10"
		/>
	{:else if name === 'd20'}<path d="m16 2 10 4 5 10-5 10-10 4L6 26 1 16 6 6l10-4Z" /><path
			d="m6 6 10 10 10-10M1 16h30M6 26l10-10 10 10M16 2v28"
		/>
	{:else if name === 'd100'}<circle cx="16" cy="16" r="13" /><path
			d="M4 16h24M16 3v26M7 7l18 18M25 7 7 25"
		/><text
			x="16"
			y="19"
			text-anchor="middle"
			fill={stroke}
			stroke="none"
			font-size="7"
			font-weight="700">%</text
		>
	{:else if name === 'campaign'}<path d="M5 27V7l11-4 11 4v20l-11 3-11-3Z" /><path
			d="m5 7 11 4 11-4M16 11v19M10 9l1 14M22 9l-1 14"
		/>
	{:else if name === 'map'}<path d="m3 7 8-4 10 4 8-4v22l-8 4-10-4-8 4V7Z" /><path
			d="m11 3 0 22M21 7v22"
		/>
	{:else if name === 'token'}<circle cx="16" cy="12" r="6" /><path
			d="M5 28c1-6 5-9 11-9s10 3 11 9H5Z"
		/>
	{:else if name === 'combat'}<path d="m7 4 21 21M21 3l8 8M4 21l7 7M5 5l22 22M3 11l8-8m10 26 8-8" />
	{:else if name === 'spell'}<path
			d="m16 2 2.3 8.4L27 7l-3.4 8 8.4 2-8.4 2.3 3.4 8-8.7-3.4L16 32l-2.3-8.1L5 27l3.4-7.7L0 17l8.4-2L5 7l8.7 3.4L16 2Z"
		/>
	{:else if name === 'skill'}<circle cx="16" cy="16" r="12" /><path d="m10 16 4 4 8-9" />
	{:else if name === 'save'}<path d="M16 3 27 7v8c0 7-4 11-11 14C9 26 5 22 5 15V7l11-4Z" /><path
			d="m11 16 3 3 7-7"
		/>
	{:else if name === 'initiative'}<path
			d="M16 3v9M16 12l-6 7M16 12l7 7M10 19l-4 9M10 19l6 9M23 19l-3 9M23 19l5 9"
		/><circle cx="16" cy="7" r="4" />
	{:else if name === 'character'}<circle cx="16" cy="9" r="5" /><path
			d="M5 29c1-7 4-11 11-11s10 4 11 11H5Z"
		/><path d="M11 23h10" />
	{:else if name === 'inventory'}<path d="M4 9h24l-2 19H6L4 9Z" /><path d="M11 9a5 5 0 0 1 10 0" />
	{:else if name === 'compendium'}<path d="M5 4h17a5 5 0 0 1 5 5v19H9a4 4 0 0 1-4-4V4Z" /><path
			d="M5 23a4 4 0 0 1 4-4h18M11 9h10M11 13h7"
		/>
	{:else if name === 'bestiary'}<path d="M5 7 10 4l6 3 6-3 5 3v14l-5 4-6-3-6 3-5-4V7Z" /><path
			d="M11 12h.1M21 12h.1M12 17q4 4 8 0"
		/>
	{:else if name === 'handout'}<path d="M7 3h13l6 6v20H7V3Z" /><path
			d="M20 3v7h6M11 16h11M11 21h11"
		/>
	{:else if name === 'music'}<path d="M13 25V6l16-3v19M13 11l16-3" /><ellipse
			cx="8"
			cy="26"
			rx="5"
			ry="3"
		/><ellipse cx="24" cy="23" rx="5" ry="3" />
	{:else if name === 'effect'}<path d="M16 3 2 27h28L16 3Z" /><path d="M16 12v7M16 23h.1" />
	{:else if name === 'camera'}<rect x="3" y="7" width="26" height="19" rx="3" /><circle
			cx="16"
			cy="16.5"
			r="5"
		/><path d="m9 7 2-4h10l2 4" />
	{:else if name === 'overlay'}<rect x="3" y="4" width="26" height="24" rx="3" /><path
			d="M3 11h26M10 4v7M22 4v7M8 17h7M8 22h12"
		/>
	{:else if name === 'chat'}<path d="M4 5h24v18H14l-7 5v-5H4V5Z" /><path d="M9 11h14M9 16h9" />
	{:else if name === 'notes'}<path d="M7 3h18v26H7z" /><path d="M11 9h10M11 14h10M11 19h7" />
	{:else if name === 'settings'}<circle cx="16" cy="16" r="4" /><path
			d="m13 3-.7 3a11 11 0 0 0-2.2 1.3l-3-.7-2 3 2 2.3a11 11 0 0 0 0 2.7l-2 2.3 2 3 3-.7a11 11 0 0 0 2.2 1.3l.7 3h6l.7-3a11 11 0 0 0 2.2-1.3l3 .7 2-3-2-2.3a11 11 0 0 0 0-2.7l2-2.3-2-3-3 .7A11 11 0 0 0 19 6l-.7-3h-5Z"
		/>
	{:else if name === 'attack'}<path
			d="M5 27 25 7M20 5l7 7M4 21l7 7M8 8l4 4m-7-1 4 4m14 8 4 4m-1-7 4 4"
		/>
	{:else}<circle cx="16" cy="16" r="12" /><path d="M16 10v7M16 22h.1" />{/if}
</svg>
