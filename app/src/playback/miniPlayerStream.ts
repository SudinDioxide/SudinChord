import { getVideoElement, useVideo } from '@/state/video';
import { usePlayer } from '@/state/player';

interface ElectronPlatform {
  isElectron?: boolean;
  sendPipOffer?: (offer: { type: string; sdp?: string }) => void;
  onPipAnswer?: (callback: (answer: { type: string; sdp?: string }) => void) => () => void;
  sendPipVideoActive?: (active: { active: boolean; aspect: number }) => void;
  onMiniPlayerStatus?: (callback: (isOpen: boolean) => void) => () => void;
}

function getElectron(): ElectronPlatform | undefined {
  return (window as unknown as { electronPlatform?: ElectronPlatform }).electronPlatform;
}

let miniPlayerOpen = false;
let activePeerConnection: RTCPeerConnection | null = null;
let surfaceClaimedByMini = false;
let capturedStream: MediaStream | null = null;
let isNegotiating = false;

function ensureSurfaceAvailable(needed: boolean) {
  if (needed && !surfaceClaimedByMini) {
    surfaceClaimedByMini = true;
    useVideo.setState((s) => ({ surfaces: s.surfaces + 1 }));
  } else if (!needed && surfaceClaimedByMini) {
    surfaceClaimedByMini = false;
    useVideo.setState((s) => ({ surfaces: Math.max(0, s.surfaces - 1) }));
  }
}

function stopWebRTC() {
  if (activePeerConnection) {
    activePeerConnection.close();
    activePeerConnection = null;
  }
}

function getMediaStream(): MediaStream | null {
  const video = getVideoElement();
  if (!video) return null;
  const existingTrack = capturedStream?.getVideoTracks()[0];
  if (capturedStream && existingTrack && existingTrack.readyState === 'live') {
    return capturedStream;
  }
  const captureFn = video as unknown as {
    captureStream?: (fps?: number) => MediaStream;
    mozCaptureStream?: (fps?: number) => MediaStream;
  };
  capturedStream = captureFn.captureStream
    ? captureFn.captureStream(30)
    : captureFn.mozCaptureStream
      ? captureFn.mozCaptureStream(30)
      : null;
  return capturedStream;
}

async function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 600): Promise<void> {
  if (pc.iceGatheringState === 'complete') return;
  await new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check);
        if (timer) clearTimeout(timer);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
    timer = setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    }, timeoutMs);
  });
}

async function startWebRTC() {
  const ep = getElectron();
  if (!ep?.sendPipOffer) return;

  // If already connected or connecting, keep streaming without interruption
  if (activePeerConnection && (activePeerConnection.connectionState === 'connected' || activePeerConnection.connectionState === 'connecting')) {
    return;
  }

  if (isNegotiating) return;
  isNegotiating = true;

  try {
    const video = getVideoElement();
    if (!video) return;

    // Ensure video has loaded data before capturing stream
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise<void>((resolve) => {
        video.addEventListener('loadeddata', () => resolve(), { once: true });
        setTimeout(resolve, 1500);
      });
    }

    // If audio is playing but video element is paused, ensure it's playing
    const player = usePlayer.getState();
    if (player.status === 'playing' && video.paused) {
      void video.play().catch(() => {});
    }

    const stream = getMediaStream();
    if (!stream) {
      console.warn('[MiniPlayerStream] captureStream is not supported or returned null');
      return;
    }

    const tracks = stream.getVideoTracks();
    const firstTrack = tracks[0];
    if (!firstTrack) {
      console.warn('[MiniPlayerStream] No video tracks in captured stream');
      return;
    }

    stopWebRTC();

    const pc = new RTCPeerConnection({ iceServers: [] });
    activePeerConnection = pc;

    pc.onconnectionstatechange = () => {
      console.log('[MiniPlayerStream Sender] Connection state:', pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (activePeerConnection === pc) {
          activePeerConnection = null;
        }
      }
    };

    tracks.forEach((track) => {
      pc.addTrack(track, stream);
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait for all local host candidates to be baked directly into offer.sdp
    await waitForIceGathering(pc, 500);

    const fullOffer = pc.localDescription;
    if (fullOffer && activePeerConnection === pc) {
      ep.sendPipOffer({ type: fullOffer.type, sdp: fullOffer.sdp });
    }
  } catch (err) {
    console.warn('[MiniPlayerStream] Failed to create complete offer:', err);
  } finally {
    isNegotiating = false;
  }
}

function syncMiniPlayerVideo() {
  const ep = getElectron();
  if (!ep || !miniPlayerOpen) {
    ensureSurfaceAvailable(false);
    stopWebRTC();
    return;
  }

  // Mini-player is open: ensure video surfaces count is >= 1 so videoDeck fetches video DASH stream
  ensureSurfaceAvailable(true);

  const videoState = useVideo.getState();
  const playerState = usePlayer.getState();
  const currentVideoId = playerState.nowPlaying?.videoId;

  const hasVideo = !!currentVideoId && videoState.videoId === currentVideoId;

  ep.sendPipVideoActive?.({
    active: hasVideo,
    aspect: videoState.aspect || 16 / 9,
  });

  if (hasVideo) {
    void startWebRTC();
  }
}

export function initMiniPlayerStream(): () => void {
  const ep = getElectron();
  if (!ep) return () => {};

  // 1. Listen for mini-player open/close
  const unsubStatus = ep.onMiniPlayerStatus?.((isOpen) => {
    miniPlayerOpen = isOpen;
    syncMiniPlayerVideo();
  });

  // 2. Handle incoming complete WebRTC answer
  const unsubAnswer = ep.onPipAnswer?.(async (answer) => {
    if (activePeerConnection && activePeerConnection.signalingState !== 'stable') {
      try {
        await activePeerConnection.setRemoteDescription(new RTCSessionDescription(answer as RTCSessionDescriptionInit));
        console.log('[MiniPlayerStream] Remote answer set successfully');
      } catch (err) {
        console.warn('[MiniPlayerStream] Answer error:', err);
      }
    }
  });

  // 3. Subscribe to video state updates (when video stream loads or changes)
  const unsubVideo = useVideo.subscribe(() => {
    if (miniPlayerOpen) syncMiniPlayerVideo();
  });

  // 4. Subscribe to player track changes
  const unsubPlayer = usePlayer.subscribe(() => {
    if (miniPlayerOpen) syncMiniPlayerVideo();
  });

  return () => {
    unsubStatus?.();
    unsubAnswer?.();
    unsubVideo();
    unsubPlayer();
    ensureSurfaceAvailable(false);
    stopWebRTC();
  };
}
