const socket = io({
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

let localStream;
let peerConnections = {}; 
let roomId;
let username;
let isHost = false;
let peerUsernames = {};
let screenStream = null;
let isScreenSharing = false;

// DOM Elements
const localVideo = document.getElementById("localVideo");
const joinButton = document.getElementById("joinButton");
const micButton = document.getElementById("micButton");
const cameraButton = document.getElementById("cameraButton");
const chatbox = document.getElementById("chatbox");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const chatToggle = document.getElementById("chat-toggle");
const participantsToggle = document.getElementById("participants-toggle");
const chatPanel = document.getElementById("chat");
const participantsPanel = document.querySelector(".participants-panel");
const panelCloseButtons = document.querySelectorAll(".panel-close");

const iceServers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// Initialize UI elements
function initUI() {
  // Panel toggles
  chatToggle.addEventListener("click", () => {
    chatPanel.classList.toggle("active");
    participantsPanel.classList.remove("active");
    updateActiveMenu();
  });

  participantsToggle.addEventListener("click", () => {
    participantsPanel.classList.toggle("active");
    chatPanel.classList.remove("active");
    updateActiveMenu();
  });

  // Close panels
  panelCloseButtons.forEach(button => {
    button.addEventListener("click", () => {
      chatPanel.classList.remove("active");
      participantsPanel.classList.remove("active");
      updateActiveMenu();
    });
  });

  // Message input
  messageInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      sendMessage();
    }
  });
}

// Update active menu item
function updateActiveMenu() {
  if (chatPanel.classList.contains("active")) {
    chatToggle.classList.add("active");
    participantsToggle.classList.remove("active");
  } else if (participantsPanel.classList.contains("active")) {
    participantsToggle.classList.add("active");
    chatToggle.classList.remove("active");
  } else {
    chatToggle.classList.remove("active");
    participantsToggle.classList.remove("active");
  }
}

// Join a room
async function joinRoom() {
  roomId = document.getElementById("room").value.trim();
  if (!roomId) {
    alert("Please enter a Room ID!");
    return;
  }

  if (!username) {
    username = prompt("Enter your name:") || "Guest";
  }

  try {
    // Clear existing connections
    Object.keys(peerConnections).forEach((userId) => {
      if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
      }
      const oldVideoContainer = document.getElementById(`container-${userId}`);
      if (oldVideoContainer) {
        oldVideoContainer.remove();
      }
    });

    // Get user media
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localVideo.srcObject = localStream;

    // Update UI
    document.getElementById("room-display").textContent = roomId;
    document.getElementById("username-display").textContent = username;
    document.getElementById("controls").style.display = "flex";
    document.getElementById("chat").style.display = "flex";
    document.getElementById("join-section").style.display = "none";

    // Join the room
    socket.emit("join-room", roomId, username);

    console.log("Joined room:", roomId);
  } catch (error) {
    console.error("Error accessing media devices:", error);
    alert("Could not access camera or microphone. Please check permissions.");
  }
}

// Create a peer connection for a new user
function createPeerConnection(userId) {
  const peerConnection = new RTCPeerConnection(iceServers);

  peerConnection.onconnectionstatechange = () => {
    console.log(`Connection state with ${userId}:`, peerConnection.connectionState);
  };

  peerConnection.oniceconnectionstatechange = () => {
    console.log(`ICE connection state with ${userId}:`, peerConnection.iceConnectionState);
  };

  // Add local tracks
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  // ICE candidate handling
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", event.candidate, userId);
    }
  };

  // Remote track handling
  peerConnection.ontrack = (event) => {
    const existingContainer = document.getElementById(`container-${userId}`);
    if (existingContainer) {
      existingContainer.remove();
    }

    const videoContainer = document.createElement("div");
    videoContainer.id = `container-${userId}`;
    videoContainer.className = "video-container";

    const remoteVideoElement = document.createElement("video");
    remoteVideoElement.id = `remote-${userId}`;
    remoteVideoElement.autoplay = true;
    remoteVideoElement.playsInline = true;

    videoContainer.appendChild(remoteVideoElement);

    const usernameLabel = document.createElement("div");
    usernameLabel.className = "username-label";
    usernameLabel.textContent = peerUsernames[userId] || "User";
    videoContainer.appendChild(usernameLabel);

    document.getElementById("videos").appendChild(videoContainer);

    remoteVideoElement.srcObject = event.streams[0];
  };

  peerConnections[userId] = peerConnection;
  updateParticipantsList();
  return peerConnection;
}

// Toggle microphone (icon only)
function toggleMic() {
  const audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;

  const micIcon = micButton.querySelector('i');
  
  if (audioTrack.enabled) {
    micIcon.className = "fas fa-microphone";
    micButton.classList.remove("muted");
  } else {
    micIcon.className = "fas fa-microphone-slash";
    micButton.classList.add("muted");
  }
}

// Toggle camera (icon only)
function toggleCamera() {
  const videoTrack = localStream.getVideoTracks()[0];
  videoTrack.enabled = !videoTrack.enabled;

  const cameraIcon = cameraButton.querySelector('i');
  
  if (videoTrack.enabled) {
    cameraIcon.className = "fas fa-video";
    cameraButton.classList.remove("muted");
  } else {
    cameraIcon.className = "fas fa-video-slash";
    cameraButton.classList.add("muted");
  }
}
// Toggle screen share
async function toggleScreenShare() {
  try {
    if (!isScreenSharing) {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      const videoTrack = screenStream.getVideoTracks()[0];
      Object.values(peerConnections).forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });

      localVideo.srcObject = screenStream;
      document.getElementById("screenShareButton").classList.add("active");
      isScreenSharing = true;

      screenStream.getVideoTracks()[0].onended = () => {
        stopScreenSharing();
      };
    } else {
      stopScreenSharing();
    }
  } catch (error) {
    console.error('Error sharing screen:', error);
    alert('Unable to share screen: ' + error.message);
  }
}

// Stop screen sharing
async function stopScreenSharing() {
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }

  const videoTrack = localStream.getVideoTracks()[0];
  Object.values(peerConnections).forEach((pc) => {
    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
    if (sender) {
      sender.replaceTrack(videoTrack);
    }
  });

  localVideo.srcObject = localStream;
  document.getElementById("screenShareButton").classList.remove("active");
  isScreenSharing = false;
}

// End the call
function endCall() {
  Object.values(peerConnections).forEach((connection) => {
    connection.close();
  });

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }

  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }

  socket.emit("leave-room");
  window.location.reload();
}

// Send a chat message
function sendMessage() {
  const message = messageInput.value.trim();
  if (!message) return;

  socket.emit("send-message", message);

  displayMessage({
    user: username + (isHost ? " (Host)" : ""),
    text: message,
    senderId: socket.id
  });

  messageInput.value = "";
}

// Display a received message
function displayMessage(data) {
  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message");

  if (data.senderId === socket.id) {
    messageDiv.classList.add("my-message");
  } else {
    messageDiv.classList.add("receiver-message");
  }

  const senderElement = document.createElement("div");
  senderElement.classList.add("sender-name");
  senderElement.textContent = data.user;
  
  const textElement = document.createElement("div");
  textElement.classList.add("message-text");
  textElement.textContent = data.text;
  
  const timeElement = document.createElement("div");
  timeElement.classList.add("message-time");
  const now = new Date();
  timeElement.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  messageDiv.appendChild(senderElement);
  messageDiv.appendChild(textElement);
  messageDiv.appendChild(timeElement);
  
  chatbox.appendChild(messageDiv);
  chatbox.scrollTop = chatbox.scrollHeight;
}

// Update participants list
function updateParticipantsList() {
  const participantsList = document.getElementById("participants-list");
  participantsList.innerHTML = '';
  
  // Add local user
  const localUserItem = document.createElement("div");
  localUserItem.className = "participant-item";
  localUserItem.innerHTML = `
    <div class="participant-avatar">
      <i class="fas fa-user"></i>
    </div>
    <div class="participant-info">
      <div class="participant-name">${username} (You)</div>
      <div class="participant-role">${isHost ? "Host" : "Participant"}</div>
    </div>
  `;
  participantsList.appendChild(localUserItem);
  
  // Add remote users
  Object.keys(peerConnections).forEach(userId => {
    if (peerConnections[userId]) {
      const userItem = document.createElement("div");
      userItem.className = "participant-item";
      userItem.innerHTML = `
        <div class="participant-avatar">
          <i class="fas fa-user"></i>
        </div>
        <div class="participant-info">
          <div class="participant-name">${peerUsernames[userId] || "User"}</div>
          <div class="participant-role">Participant</div>
        </div>
      `;
      participantsList.appendChild(userItem);
    }
  });
  
  // Update participant count
  document.getElementById("participant-count").textContent = Object.keys(peerConnections).length + 1;
}

// Socket event handlers
socket.on("user-connected", async (userId, userName) => {
  peerUsernames[userId] = userName;
  updateParticipantsList();

  try {
    const peerConnection = createPeerConnection(userId);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("offer", offer, userId);
  } catch (error) {
    console.error("Error in user-connected handler:", error);
  }
});

socket.on("room-users", async (users) => {
  isHost = users.length === 0;
  document.getElementById("user-role").textContent = isHost ? "Host" : "Participant";

  users.forEach((user) => {
    peerUsernames[user.id] = user.username;
    createPeerConnection(user.id);
  });
  updateParticipantsList();
});

socket.on("offer", async (offer, senderId) => {
  try {
    let peerConnection = peerConnections[senderId] || createPeerConnection(senderId);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit("answer", answer, senderId);
  } catch (error) {
    console.error("Error handling offer:", error);
  }
});

socket.on("answer", async (answer, senderId) => {
  const peerConnection = peerConnections[senderId];
  if (peerConnection) {
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error("Error handling answer:", error);
    }
  }
});

socket.on("ice-candidate", async (candidate, senderId) => {
  const peerConnection = peerConnections[senderId];
  if (peerConnection) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
    }
  }
});

socket.on("user-disconnected", (userId, userName) => {
  if (peerConnections[userId]) {
    peerConnections[userId].close();
    delete peerConnections[userId];
  }

  const videoContainer = document.getElementById(`container-${userId}`);
  if (videoContainer) {
    videoContainer.remove();
  }

  displayMessage({
    user: "System",
    text: `${userName} has left the room`,
    senderId: "system"
  });
  
  updateParticipantsList();
});

socket.on("receive-message", (data) => {
  displayMessage(data);
});

// Initialize the UI when the page loads
document.addEventListener("DOMContentLoaded", initUI);