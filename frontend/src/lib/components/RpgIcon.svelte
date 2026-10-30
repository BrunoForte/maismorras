<script lang="ts">
	let { name, size = 28, title }: { name: string; size?: number; title?: string } = $props();
	const stroke = 'currentColor';
</script>

<svg
	data-icon={name}
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
	{#if name === 'd4'}<g {stroke} stroke-width="1.5" stroke-linejoin="round"
			><path d="M16 3 29 27H3L16 3Z" fill="#6d5033" /><path
				d="M16 3v24H3L16 3Z"
				fill="#a77b46"
				stroke="none"
			/><path d="m16 3 13 24H16V3Z" fill="#4a3626" stroke="none" /></g
		>
	{:else if name === 'd6'}<g {stroke} stroke-width="1.5" stroke-linejoin="round"
			><path d="m16 3 12 7v13l-12 6-12-6V10l12-7Z" fill="#684c32" /><path
				d="m16 3 12 7-12 7-12-7 12-7Z"
				fill="#a77b46"
				stroke="none"
			/><path d="m4 10 12 7v12l-12-6V10Z" fill="#765737" stroke="none" /><path
				d="m28 10-12 7v12l12-6V10Z"
				fill="#493426"
				stroke="none"
			/></g
		>
	{:else if name === 'd8'}<g {stroke} stroke-width="1.5" stroke-linejoin="round"
			><path d="m16 3 12 8-4 15-8 3-8-3-4-15 12-8Z" fill="#715133" /><path
				d="m16 3 12 8-12 5-12-5 12-8Z"
				fill="#a77b46"
				stroke="none"
			/><path d="m4 11 12 5-8 10-4-15Z" fill="#85613a" stroke="none" /><path
				d="m28 11-12 5 8 10 4-15Z"
				fill="#60462f"
				stroke="none"
			/><path d="m8 26 8-10v13l-8-3Z" fill="#765737" stroke="none" /><path
				d="m24 26-8-10v13l8-3Z"
				fill="#493426"
				stroke="none"
			/></g
		>
	{:else if name === 'd10'}<g {stroke} stroke-width="1.5" stroke-linejoin="round"
			><path d="m16 3 12 9-5 15H9L4 12l12-9Z" fill="#735335" /><path
				d="m16 3 12 9-12 5L4 12l12-9Z"
				fill="#a77b46"
				stroke="none"
			/><path d="m4 12 12 5v10H9L4 12Z" fill="#59402c" stroke="none" /></g
		>
	{:else if name === 'd12'}<g {stroke} stroke-width="1.5" stroke-linejoin="round"
			><path d="m16 2 8 2 6 6 2 6-2 6-6 6-8 2-8-2-6-6-2-6 2-6 6-6 8-2Z" fill="#715133" /><path
				d="m16 2 8 2 6 6-14 6-14-6 6-6 8-2Z"
				fill="#a77b46"
				stroke="none"
			/><path d="m2 10 14 6-10 12-6-6-2-6 2-6Z" fill="#85613a" stroke="none" /><path
				d="m30 10-14 6 10 12 6-6 2-6-2-6Z"
				fill="#60462f"
				stroke="none"
			/><path d="m6 28 10-12v14l-8-2Z" fill="#765737" stroke="none" /><path
				d="m26 28-10-12v14l8-2Z"
				fill="#493426"
				stroke="none"
			/></g
		>
	{:else if name === 'd20'}<g {stroke} stroke-width="1.5" stroke-linejoin="round"
			><path d="m16 2 10 4 5 10-5 10-10 4L6 26 1 16 6 6l10-4Z" fill="#705133" /><path
				d="m16 2 10 4 5 10-15 0L6 6l10-4Z"
				fill="#a77b46"
				stroke="none"
			/><path d="m16 2v14L1 16 6 6l10-4Z" fill="#89643c" stroke="none" /><path
				d="m31 16-5 10-10 4V16h15Z"
				fill="#513b2a"
				stroke="none"
			/><path d="m1 16 15 0-10 10-5-10Z" fill="#765737" stroke="none" /><path
				d="m6 26 10-10v14L6 26Z"
				fill="#60462f"
				stroke="none"
			/></g
		>
	{:else if name === 'dice-stack'}<g
			transform="translate(-2 5) scale(.56)"
			{stroke}
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M16 3 29 27H3L16 3Z" fill="#684c32" />
			<path d="M16 3 16 27H3L16 3Z" fill="#9b754b" stroke="none" />
			<path d="m16 3 13 24H16V3Z" fill="#503c2c" stroke="none" />
		</g><g
			transform="translate(14 0) scale(.55)"
			{stroke}
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="m16 3 12 7v13l-12 6-12-6V10l12-7Z" fill="#684c32" />
			<path d="m16 3 12 7-12 7-12-7 12-7Z" fill="#9b754b" />
			<path d="m4 10 12 7v12l-12-6V10Z" fill="#765737" />
			<path d="m28 10-12 7v12l12-6V10Z" fill="#503c2c" />
		</g><g
			transform="translate(5 9) scale(.77)"
			{stroke}
			stroke-width="1.45"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="m16 2 10 4 5 10-5 10-10 4L6 26 1 16 6 6l10-4Z" fill="#765637" />
			<path d="m16 5 7 3 3 7-10 1-10-1 3-7 7-3Z" fill="#987246" stroke="none" />
			<path d="m16 17 10-2-4 9-6 3-6-3-4-9 10 2Z" fill="#62472f" stroke="none" />
		</g>
	{:else if name === 'd100'}<g {stroke} stroke-width="1.5" stroke-linejoin="round"
			><path d="m16 2 6 1 6 4 4 6v6l-4 6-6 4-6 1-6-1-6-4-4-6v-6l4-6 6-4 6-1Z" fill="#705133" /><path
				d="m16 2 6 1 6 4-12 9-12-4 4-6 6-4 6-1Z"
				fill="#a77b46"
				stroke="none"
			/><path d="m4 12 12 4-4 14-6-4-4-6v-8Z" fill="#85613a" stroke="none" /><path
				d="m28 7 4 6v6l-4 6-12-9 12-9Z"
				fill="#60462f"
				stroke="none"
			/><path d="m12 30 4-14 4 14-4 1-4-1Z" fill="#765737" stroke="none" /></g
		>
	{:else if name === 'campaign'}<g {stroke} stroke-width="1.35" stroke-linejoin="round"
			><path d="M5 27V7l11-4 11 4v20l-11 3-11-3Z" fill="#684c32" /><path
				d="m5 7 11 4 11-4-11-4L5 7Z"
				fill="#a77b46"
				stroke="none"
			/><path d="m5 7 11 4v19L5 27V7Z" fill="#89643c" stroke="none" /><path
				d="m16 11 11-4v20l-11 3V11Z"
				fill="#493426"
				stroke="none"
			/></g
		>
	{:else if name === 'map'}<g {stroke} stroke-width="1.35" stroke-linejoin="round"
			><path d="m3 7 8-4 10 4 8-4v22l-8 4-10-4-8 4V7Z" fill="#684c32" /><path
				d="m3 7 8-4v22l-8 4V7Z"
				fill="#a77b46"
				stroke="none"
			/><path d="m11 3 10 4v22l-10-4V3Z" fill="#765737" stroke="none" /><path
				d="m21 7 8-4v22l-8 4V7Z"
				fill="#493426"
				stroke="none"
			/></g
		>
	{:else if name === 'token'}<g {stroke} stroke-width="1.4" stroke-linejoin="round"
			><circle cx="16" cy="10" r="6" fill="#a77b46" /><path
				d="M5 28c1-6 5-9 11-9s10 3 11 9H5Z"
				fill="#684c32"
			/></g
		>
	{:else if name === 'combat' || name === 'initiative'}<g
			stroke="#704b28"
			stroke-width=".8"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="m9.3 20.6 15.2-15.1-2.1 8.3-10.7 9.1Z" fill="#d8ad67" />
			<path d="m22.7 20.6-15.2-15.1 2.1 8.3 10.7 9.1Z" fill="#c39152" />
			<path d="m7 18 7 6-1.2 1.5-7-6Z" fill="#d8ad67" />
			<path d="m25 18-7 6 1.2 1.5 7-6Z" fill="#c39152" />
			<path d="m7.8 23.3-4.6 5 1.2 1.1 4.7-5Z" fill="#d8ad67" />
			<path d="m24.2 23.3 4.6 5-1.2 1.1-4.7-5Z" fill="#c39152" />
			<circle cx="3.3" cy="29.1" r="1.15" fill="#d8ad67" />
			<circle cx="28.7" cy="29.1" r="1.15" fill="#c39152" />
			<path
				d="m16 13 1.4 2.2 2.2 1.4-2.2 1.4-1.4 2.2-1.4-2.2-2.2-1.4 2.2-1.4L16 13Z"
				fill="#f0cb85"
				stroke="none"
			/>
		</g>
	{:else if name === 'barrier-arch'}<g {stroke} stroke-width="1.25" stroke-linejoin="round"
			><path d="M5 29V15a11 11 0 0 1 22 0v14h-4V15a7 7 0 0 0-14 0v14H5Z" fill="#765536" /><path
				d="M5 15a11 11 0 0 1 22 0v4a11 11 0 0 0-22 0v-4Z"
				fill="#a77b46"
				stroke="none"
			/><path d="M5 19h4v10H5zM23 19h4v10h-4z" fill="#493426" stroke="none" /></g
		>
	{:else if name === 'ruler'}<g {stroke} stroke-width="1.15" stroke-linejoin="round"
			><path d="m5 23 18-18 5 5-18 18-5-5Z" fill="#684c32" /><path
				d="m5 23 18-18 2 2-18 18-2-2Z"
				fill="#a77b46"
				stroke="none"
			/><path d="m7 25 18-18 3 3-18 18-3-3Z" fill="#493426" stroke="none" /><path
				d="m12 16 3 3m1-9 4 4m-12 7 2 2m7-16 2 2"
				fill="none"
				stroke="#f0cb85"
				stroke-width="1.4"
			/></g
		>
	{:else if name === 'layers'}<g {stroke} stroke-width="1.2" stroke-linejoin="round"
			><path d="m16 3 12 7-12 7-12-7 12-7Z" fill="#a77b46" /><path
				d="m4 10 12 7v4L4 14v-4Z"
				fill="#765737"
				stroke="none"
			/><path d="m28 10-12 7v4l12-7v-4Z" fill="#493426" stroke="none" /><path
				d="m4 16 12 7 12-7v4l-12 7-12-7v-4Z"
				fill="#765737"
			/><path d="m4 16 12 7v4L4 20v-4Z" fill="#a77b46" stroke="none" /><path
				d="m28 16-12 7v4l12-7v-4Z"
				fill="#493426"
				stroke="none"
			/></g
		>
	{:else if name === 'persistent-area'}<g {stroke} stroke-width="1.25" stroke-linejoin="round"
			><path d="m16 3 11 6v14l-11 6-11-6V9l11-6Z" fill="#684c32" /><path
				d="m16 3 11 6-11 7L5 9l11-6Z"
				fill="#a77b46"
				stroke="none"
			/><path d="m5 9 11 7v13l-11-6V9Z" fill="#765737" stroke="none" /><path
				d="m27 9-11 7v13l11-6V9Z"
				fill="#493426"
				stroke="none"
			/><path d="M13 14h6v6h-6z" fill="#e0b86f" stroke="#493426" stroke-width="1" /></g
		>
	{:else if name === 'map-signal'}<g
			stroke="#704b28"
			stroke-width="1.15"
			stroke-linecap="round"
			stroke-linejoin="round"
			><path d="M16 29s9-9.2 9-16a9 9 0 1 0-18 0c0 6.8 9 16 9 16Z" fill="#684c32" /><path
				d="M16 6a7 7 0 0 1 7 7c0 4.4-4.5 10.3-7 13-2.5-2.7-7-8.6-7-13a7 7 0 0 1 7-7Z"
				fill="#a77b46"
				stroke="none"
			/><path d="m16 9 4 4-4 4-4-4 4-4Z" fill="#493426" stroke="none" /><path
				d="M4 8Q2 11 2 14m26-6q2 3 2 6"
				fill="none"
				stroke="#e0b86f"
				stroke-width="1.8"
			/></g
		>
	{:else if name === 'fog'}<g
			{stroke}
			stroke-width="1.15"
			stroke-linecap="round"
			stroke-linejoin="round"
			><path
				d="M7 23a5 5 0 0 1-.5-10 9.5 9.5 0 0 1 18-1 5.5 5.5 0 0 1 1 10.9H7Z"
				fill="#684c32"
			/><path d="M7 13a9.5 9.5 0 0 1 17-1l-3 5H8l-2-2 1-2Z" fill="#a77b46" stroke="none" /><path
				d="M7 23h6l-2 5H7a2.5 2.5 0 0 1 0-5Zm9 0h8a2.5 2.5 0 0 1 0 5h-8l2-2.5L16 23Z"
				fill="#765737"
				stroke="none"
			/><path d="M4 18H2m28 0h-2" fill="none" stroke="#e0b86f" stroke-width="1.8" /></g
		>
	{:else if name === 'spell'}<g {stroke} stroke-width="1.3" stroke-linejoin="round"
			><path
				d="M16 27c-3-3-7-3-12-2V7c5-1 9 0 12 3 3-3 7-4 12-3v18c-5-1-9-1-12 2Z"
				fill="#60462f"
			/><path d="M5 7c5-1 9 0 11 3v17c-3-3-7-3-11-2V7Z" fill="#89643c" stroke="none" /><path
				d="M27 7c-5-1-9 0-11 3v17c3-3 7-3 11-2V7Z"
				fill="#493426"
				stroke="none"
			/><path d="M16 10v17" fill="none" stroke-width="1.5" /><path
				d="m16 2 2 3-2 3-2-3 2-3Z"
				fill="#e0b86f"
				stroke="none"
			/></g
		>
	{:else if name === 'skill'}<g {stroke} stroke-width="1.4" stroke-linejoin="round"
			><circle cx="16" cy="16" r="12" fill="#765536" /><path
				d="m10 16 4 4 8-9"
				fill="none"
				stroke="#171316"
				stroke-width="3"
			/><path d="m10 16 4 4 8-9" fill="none" stroke="#e0b86f" stroke-width="1.35" /></g
		>
	{:else if name === 'save'}<g {stroke} stroke-width="1.35" stroke-linejoin="round"
			><path d="M16 3 27 7v8c0 7-4 11-11 14C9 26 5 22 5 15V7l11-4Z" fill="#684c32" /><path
				d="m16 5 9 3v7c0 5-3 9-9 12V5Z"
				fill="#a77b46"
				stroke="none"
			/><path d="m11 16 3 3 7-7" fill="none" stroke="#171316" stroke-width="3" /><path
				d="m11 16 3 3 7-7"
				fill="none"
				stroke="#e0b86f"
				stroke-width="1.3"
			/></g
		>
	{:else if name === 'character'}<g {stroke} stroke-width="1.4" stroke-linejoin="round"
			><circle cx="16" cy="9" r="5" fill="#a77b46" /><path
				d="M5 29c1-7 4-11 11-11s10 4 11 11H5Z"
				fill="#684c32"
			/></g
		>
	{:else if name === 'inventory'}<g {stroke} stroke-width="1.4" stroke-linejoin="round"
			><path d="M4 9h24l-2 19H6L4 9Z" fill="#684c32" /><path
				d="M7 12h18l-1.5 14h-15L7 12Z"
				fill="#765737"
				stroke="none"
			/><path d="M11 9a5 5 0 0 1 10 0" fill="none" stroke-width="2.5" /><path
				d="M11 9a5 5 0 0 1 10 0"
				fill="none"
				stroke="#e0b86f"
				stroke-width="1"
			/></g
		>
	{:else if name === 'compendium'}<g {stroke} stroke-width="1.3" stroke-linejoin="round"
			><path d="M5 4h17a5 5 0 0 1 5 5v19H9a4 4 0 0 1-4-4V4Z" fill="#684c32" /><path
				d="M9 7h14a4 4 0 0 1 2 1v17H9a4 4 0 0 0-4 2V8a4 4 0 0 1 4-1Z"
				fill="#765737"
				stroke="none"
			/><path d="M9 25h18" fill="none" stroke-width="1.5" /><path
				d="M11 11h9M11 15h7"
				fill="none"
				stroke="#e0b86f"
				stroke-width="1.4"
			/></g
		>
	{:else if name === 'bestiary'}<g fill="#a77b46" {stroke} stroke-width="1" stroke-linejoin="miter"
			><path d="M12 4h8v3h4v4h4v6h-4v4h-4v4h-8v-4H8v-4H4v-6h4V7h4V4Z" /><path
				d="M10 13h3v3h-3zM19 13h3v3h-3z"
				fill="#171316"
				stroke="none"
			/></g
		>
	{:else if name === 'handout'}<g {stroke} stroke-width="1.35" stroke-linejoin="round"
			><path d="M7 3h13l6 6v20H7V3Z" fill="#684c32" /><path
				d="M9 5h10v7h5v15H9V5Z"
				fill="#765737"
				stroke="none"
			/><path d="M20 3v7h6" fill="none" stroke="#e0b86f" stroke-width="1.5" /><path
				d="M12 17h10M12 21h10"
				fill="none"
				stroke="#e0b86f"
				stroke-width="1.5"
			/></g
		>
	{:else if name === 'music'}<g
			{stroke}
			stroke-width="1.4"
			stroke-linecap="round"
			stroke-linejoin="round"
			><path d="M13 25V6l16-3v19l-4 1V9l-9 2v13l-4 1Z" fill="#765536" /><path
				d="m16 8 9-2v3l-9 2V8Z"
				fill="#a77b46"
				stroke="none"
			/><ellipse cx="8" cy="26" rx="5" ry="3" fill="#a77b46" /><ellipse
				cx="24"
				cy="23"
				rx="5"
				ry="3"
				fill="#a77b46"
			/></g
		>
	{:else if name === 'effect'}<g {stroke} stroke-width="1.35" stroke-linejoin="round"
			><path d="M16 3 2 27h28L16 3Z" fill="#765536" /><path
				d="m16 7 10 17H6L16 7Z"
				fill="#a77b46"
				stroke="none"
			/><path
				d="M16 12v7M16 22h.1"
				fill="none"
				stroke="#171316"
				stroke-width="2.8"
				stroke-linecap="round"
			/></g
		>
	{:else if name === 'camera'}<g {stroke} stroke-width="1.35" stroke-linejoin="round"
			><path d="M3 8h6l2-4h10l2 4h6v18H3V8Z" fill="#684c32" /><path
				d="M5 10h22v14H5V10Z"
				fill="#765737"
				stroke="none"
			/><circle cx="16" cy="17" r="6" fill="#a77b46" /><circle
				cx="16"
				cy="17"
				r="3"
				fill="#171316"
				stroke="#e0b86f"
				stroke-width="1.3"
			/></g
		>
	{:else if name === 'overlay'}<g {stroke} stroke-width="1.35" stroke-linejoin="round"
			><rect x="3" y="4" width="26" height="24" rx="3" fill="#684c32" /><path
				d="M5 12h22v14H5V12Z"
				fill="#765737"
				stroke="none"
			/><path d="M3 11h26V7a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v4Z" fill="#a77b46" stroke="none" /><path
				d="M10 4v7M22 4v7"
				fill="none"
				stroke="#493426"
				stroke-width="2"
			/><path d="M8 17h7M8 22h12" fill="none" stroke="#e0b86f" stroke-width="1.5" /></g
		>
	{:else if name === 'chat'}<g {stroke} stroke-width="1.35" stroke-linejoin="round"
			><path d="M4 5h24v18H14l-7 5v-5H4V5Z" fill="#684c32" /><path
				d="M7 8h18v12H13l-6 4V8Z"
				fill="#765737"
				stroke="none"
			/><path
				d="M10 12h12M10 16h8"
				fill="none"
				stroke="#e0b86f"
				stroke-width="1.6"
				stroke-linecap="round"
			/></g
		>
	{:else if name === 'notes'}<g {stroke} stroke-width="1.35" stroke-linejoin="round"
			><path d="M7 3h18v26H7z" fill="#684c32" /><path
				d="M10 5h13v22H10z"
				fill="#765737"
				stroke="none"
			/><path
				d="M13 10h7M13 15h7M13 20h5"
				fill="none"
				stroke="#e0b86f"
				stroke-width="1.6"
				stroke-linecap="round"
			/></g
		>
	{:else if name === 'settings'}<g {stroke} stroke-width="1.2" stroke-linejoin="round"
			><path
				d="M13 2h6l1 4 3 1 3-2 4 5-3 3v4l3 3-4 5-3-2-3 1-1 4h-6l-1-4-3-1-3 2-4-5 3-3v-4l-3-3 4-5 3 2 3-1 1-4Z"
				fill="#765536"
			/><circle cx="16" cy="16" r="5" fill="#171316" stroke="#e0b86f" stroke-width="1.8" /></g
		>
	{:else if name === 'attack'}<g
			stroke="#704b28"
			stroke-width=".8"
			stroke-linecap="round"
			stroke-linejoin="round"
			><path d="m10 22 15-16-2 8-11 10Z" fill="#d8ad67" /><path
				d="m7 18 7 6-1.2 1.5-7-6Z"
				fill="#d8ad67"
			/><path d="m8 23-4.5 5 1.2 1.1 4.7-5Z" fill="#c39152" /><circle
				cx="3.7"
				cy="29.1"
				r="1.1"
				fill="#c39152"
				stroke="none"
			/></g
		>
	{:else if name === 'chevron-up'}<path d="m7 19 9-9 9 9" />
	{:else if name === 'chevron-down'}<path d="m7 13 9 9 9-9" />
	{:else}<g {stroke} stroke-width="1.35" stroke-linejoin="round"
			><circle cx="16" cy="16" r="12" fill="#765536" /><path
				d="M16 9v9M16 23h.1"
				fill="none"
				stroke="#171316"
				stroke-width="3"
				stroke-linecap="round"
			/><path
				d="M16 9v9M16 23h.1"
				fill="none"
				stroke="#e0b86f"
				stroke-width="1.4"
				stroke-linecap="round"
			/></g
		>{/if}
</svg>
