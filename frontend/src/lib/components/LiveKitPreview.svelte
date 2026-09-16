<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		Room,
		RoomEvent,
		Track,
		type RemoteTrackPublication,
		type RemoteParticipant
	} from 'livekit-client';
	let { serverUrl, token }: { serverUrl: string; token: string } = $props();
	let video = $state<HTMLVideoElement>();
	let status = $state('Conectando…');
	let room: Room | null = null;
	function attach(publication: RemoteTrackPublication) {
		if (publication.track?.kind === Track.Kind.Video && video) publication.track.attach(video);
	}
	onMount(async () => {
		if (!serverUrl || !token) {
			status = 'Configure a sala LiveKit.';
			return;
		}
		room = new Room({ adaptiveStream: true, dynacast: true });
		room.on(RoomEvent.TrackSubscribed, (track) => {
			if (track.kind === Track.Kind.Video && video) track.attach(video);
		});
		room.on(RoomEvent.TrackUnsubscribed, (track) => {
			if (video) track.detach(video);
		});
		room.on(RoomEvent.Disconnected, () => (status = 'Desconectado'));
		try {
			await room.connect(serverUrl, token, { autoSubscribe: true });
			status = room.remoteParticipants.size ? '' : 'Aguardando câmera…';
			room.remoteParticipants.forEach((participant: RemoteParticipant) =>
				participant.trackPublications.forEach(attach)
			);
		} catch {
			status = 'Não foi possível conectar ao LiveKit.';
		}
	});
	onDestroy(() => {
		room?.disconnect();
		room = null;
	});
</script>

<div class="livekit-preview">
	<video bind:this={video} autoplay playsinline muted></video>
	{#if status}<small>{status}</small>{/if}
</div>

<style>
	.livekit-preview {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		overflow: hidden;
		background: #100d12;
	}
	video {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	small {
		position: absolute;
		inset: auto 0.5rem 0.4rem;
		color: #d8c9b9;
		font-size: 0.65rem;
		text-align: center;
		text-shadow: 0 1px 3px #000;
	}
</style>
