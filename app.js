const SUPABASE_URL = "https://iezjmlesxdqtgrzopnyf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_oZzBug6zzrXVDEaLljsHeQ_EPQOhcnu";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const ADMIN_EMAILS = ["admin@lostsound.com", "amirtalles@gmail.com"];

let tracks = [], artists = [], liked = new Set(), currentIndex = -1, currentUser = null, currentProfile = null;
let listeningSeconds = 0, lastAudioTime = 0, currentTrackObj = null, authMode = "register", selectedOptionTrack = null;
const loadedPages = new Set();
const audio = document.getElementById("audio");

let cfCurrentIndex = 0;
let cfStartX = 0;
let cfIsDragging = false;

let cropTarget = "profile", cropFile = null, cropImage = null, cropScale = 1, cropX = 0, cropY = 0, cropDragging = false, cropLastX = 0, cropLastY = 0;
let croppedAvatarBlob = null, croppedCoverBlob = null, croppedEditCoverBlob = null;

document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  setupIntroVideo();
  bindButtons();
  setupPullToRefresh();
  
  await checkSession();
  await loadInitialHomeData();
  applyRoute(false);
});

function initTheme(){
  const savedTheme = localStorage.getItem("ls_theme") || "night";
  setTheme(savedTheme);
}

function setTheme(mode){
  const btn = document.getElementById("themeToggleBtn");
  if (mode === "morning") {
    document.body.classList.add("morning-mode");
    if(btn) btn.textContent = "☀️";
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#f5f2eb');
  } else {
    document.body.classList.remove("morning-mode");
    if(btn) btn.textContent = "🌙";
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0d0d0d');
  }
  localStorage.setItem("ls_theme", mode);
}

function toggleTheme(){
  const isMorning = document.body.classList.contains("morning-mode");
  setTheme(isMorning ? "night" : "morning");
}

function setupIntroVideo(){
  const v = document.getElementById("introCoverVideo");
  if (!v) return;
  v.addEventListener("ended", () => { v.currentTime = 0; v.play().catch(()=>{}); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && v.paused) v.play().catch(()=>{}); });
}

function freeMemoryForPicker(){
  const v = document.getElementById("introCoverVideo");
  if(v) v.pause();
  const fv = document.getElementById("fullCoverVideo");
  if(fv) fv.pause();
}

function restoreMemoryAfterPicker(){
  const v = document.getElementById("introCoverVideo");
  if(v && document.querySelector(".view.active")?.id === "home") v.play().catch(()=>{});
  const fv = document.getElementById("fullCoverVideo");
  if(fv && document.getElementById("fullPlayerOverlay")?.classList.contains("open")) fv.play().catch(()=>{});
}

function setupPullToRefresh(){
  let touchStartY = 0, isPulling = false;

  window.addEventListener('touchstart', (e) => {
    if (window.scrollY === 0) {
      touchStartY = e.touches[0].clientY;
      isPulling = true;
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!isPulling) return;
    const pullDistance = e.touches[0].clientY - touchStartY;
    if (pullDistance > 75 && window.scrollY === 0) {
      const spinner = document.getElementById("pullRefreshSpinner");
      if (spinner) spinner.style.display = "block";
    }
  }, { passive: true });

  window.addEventListener('touchend', async () => {
    if (!isPulling) return;
    isPulling = false;
    const spinner = document.getElementById("pullRefreshSpinner");
    if (spinner && spinner.style.display === "block") {
      loadedPages.clear();
      await loadInitialHomeData();
      spinner.style.display = "none";
      toast("Archive Updated!");
    }
  });
}

function bindButtons(){
  const logoBtn = document.getElementById("brandLogoBtn"), popup = document.getElementById("socialPopup");
  if (logoBtn && popup) {
    logoBtn.onclick = (e) => { e.stopPropagation(); popup.classList.toggle("show"); };
    document.addEventListener("click", () => popup.classList.remove("show"));
  }

  document.getElementById("themeToggleBtn").onclick = toggleTheme;
  document.getElementById("siteBackButton").onclick = goBack;
  document.querySelectorAll(".pill-item").forEach(btn => btn.onclick = () => navigate(btn.dataset.view));
  document.querySelectorAll("[data-go]").forEach(btn => btn.onclick = () => { closeDrawer(); navigate(btn.dataset.go); });

  document.getElementById("menuButton").onclick = () => document.getElementById("drawer").classList.add("open");
  document.getElementById("closeDrawer").onclick = closeDrawer;
  document.getElementById("authMenuButton").onclick = () => { closeDrawer(); currentUser ? logout() : openAuth("login"); };
  
  const authClose = document.getElementById("authClose");
  if(authClose) authClose.onclick = () => document.getElementById("authOverlay").classList.remove("open");
  const authSwitch = document.getElementById("authSwitchBtn");
  if(authSwitch) authSwitch.onclick = toggleAuthMode;
  const authForgot = document.getElementById("authForgotBtn");
  if(authForgot) authForgot.onclick = () => openAuth("forgot");
  const authSub = document.getElementById("authSubmit");
  if(authSub) authSub.onclick = submitAuth;
  const googleBtn = document.getElementById("btnGoogleAuth");
  if(googleBtn) googleBtn.onclick = signInWithGoogle;

  document.getElementById("dockPlayer").onclick = (e) => {
    if (e.target.id !== "dockPlayBtn") openFullPlayer();
  };
  document.getElementById("dockPlayBtn").onclick = (e) => { e.stopPropagation(); togglePlay(); };
  document.getElementById("dockProgressWrap").onclick = (e) => { e.stopPropagation(); seekAudio(e); };

  const fullClose = document.getElementById("fullPlayerClose");
  if(fullClose) fullClose.onclick = closeFullPlayer;
  const fullPlay = document.getElementById("fullPlayBtn");
  if(fullPlay) fullPlay.onclick = togglePlay;
  const fullPrev = document.getElementById("fullPrevBtn");
  if(fullPrev) fullPrev.onclick = () => playIndex(currentIndex <= 0 ? tracks.length - 1 : currentIndex - 1);
  const fullNext = document.getElementById("fullNextBtn");
  if(fullNext) fullNext.onclick = nextTrack;
  const fullScrub = document.getElementById("fullScrubBar");
  if(fullScrub) fullScrub.onclick = seekAudioFull;
  const fullLike = document.getElementById("fullLikeBtn");
  if(fullLike) fullLike.onclick = toggleLikeCurrent;

  const pubBtn = document.getElementById("publishButton");
  if(pubBtn) pubBtn.onclick = publishTrack;
  const saveTrkBtn = document.getElementById("saveTrackButton");
  if(saveTrkBtn) saveTrkBtn.onclick = saveTrackEdit;
  const sInput = document.getElementById("searchInput");
  if(sInput) sInput.oninput = runSearch;

  document.querySelectorAll("input[type='file']").forEach(inp => {
    inp.removeAttribute("capture");
    inp.addEventListener("click", (e) => {
      e.stopPropagation();
      freeMemoryForPicker();
    });
  });

  const saveProfBtn = document.getElementById("saveProfileButton");
  if(saveProfBtn) saveProfBtn.onclick = saveProfile;

  const pPhoto = document.getElementById("profilePhotoFile");
  if(pPhoto) pPhoto.onchange = e => { restoreMemoryAfterPicker(); const f = e.target.files[0]; if (f) startCropping(f, "profile"); };
  const cFile = document.getElementById("coverFile");
  if(cFile) cFile.onchange = e => { restoreMemoryAfterPicker(); const f = e.target.files[0]; if (f) startCropping(f, "cover"); };
  const ecFile = document.getElementById("editCoverFile");
  if(ecFile) ecFile.onchange = e => { restoreMemoryAfterPicker(); const f = e.target.files[0]; if (f) startCropping(f, "editCover"); };

  const cCancel = document.getElementById("cropCancel");
  if(cCancel) cCancel.onclick = () => document.getElementById("cropOverlay").classList.remove("open");
  const cSave = document.getElementById("cropSave");
  if(cSave) cSave.onclick = applyCroppedImage;
  const cZoom = document.getElementById("cropZoom");
  if(cZoom) cZoom.oninput = e => { cropScale = Number(e.target.value); drawCrop(); };
  const cZOut = document.getElementById("cropZoomOut");
  if(cZOut) cZOut.onclick = () => { cropScale = Math.max(1, cropScale - 0.1); drawCrop(); };
  const cZIn = document.getElementById("cropZoomIn");
  if(cZIn) cZIn.onclick = () => { cropScale = Math.min(3, cropScale + 0.1); drawCrop(); };

  const cropStage = document.getElementById("cropStage");
  if(cropStage){
    cropStage.addEventListener("mousedown", cropPointerStart);
    window.addEventListener("mousemove", cropPointerMove, { passive: false });
    window.addEventListener("mouseup", cropPointerEnd);
    cropStage.addEventListener("touchstart", cropPointerStart, { passive: false });
    window.addEventListener("touchmove", cropPointerMove, { passive: false });
    window.addEventListener("touchend", cropPointerEnd);
  }

  const optClose = document.getElementById("optCloseTrack");
  if(optClose) optClose.onclick = closeTrackOptions;
  const optShare = document.getElementById("optShareTrack");
  if(optShare) optShare.onclick = () => { shareTrack(selectedOptionTrack); closeTrackOptions(); };
  const optEdit = document.getElementById("optEditTrack");
  if(optEdit) optEdit.onclick = () => { openEditTrack(selectedOptionTrack); closeTrackOptions(); };
  const optDel = document.getElementById("optDeleteTrack");
  if(optDel) optDel.onclick = () => { deleteTrack(selectedOptionTrack); closeTrackOptions(); };

  audio.ontimeupdate = updateProgress;
  audio.onplay = () => {
    document.getElementById("dockPlayBtn").textContent = "Ⅱ";
    const fp = document.getElementById("fullPlayBtn");
    if(fp) fp.textContent = "Ⅱ";
    document.getElementById("heroVinyl")?.classList.add("playing");
    const fv = document.getElementById("fullCoverVideo");
    if (fv && fv.style.display === "block") fv.play().catch(()=>{});
  };
  audio.onpause = () => {
    document.getElementById("dockPlayBtn").textContent = "▶";
    const fp = document.getElementById("fullPlayBtn");
    if(fp) fp.textContent = "▶";
    document.getElementById("heroVinyl")?.classList.remove("playing");
    const fv = document.getElementById("fullCoverVideo");
    if (fv) fv.pause();
  };
  audio.onended = nextTrack;
}

function openFullPlayer(){
  if (!currentTrackObj) return;
  document.getElementById("fullPlayerOverlay")?.classList.add("open");
  const fv = document.getElementById("fullCoverVideo");
  if (fv && fv.style.display === "block" && !audio.paused) fv.play().catch(()=>{});
}

function closeFullPlayer(){
  document.getElementById("fullPlayerOverlay")?.classList.remove("open");
}

function closeDrawer() { document.getElementById("drawer")?.classList.remove("open"); }

function openAuth(mode = "register") {
  authMode = mode;
  const overlay = document.getElementById("authOverlay");
  const fb = document.getElementById("authFeedbackOverlay");
  if(fb) fb.classList.remove("show");

  const title = document.getElementById("authTitle");
  const submit = document.getElementById("authSubmit");
  const nameField = document.getElementById("authNameField");
  const passField = document.getElementById("authPasswordField");
  const googleSection = document.getElementById("googleAuthSection");
  const forgotRow = document.getElementById("authForgotRow");
  const switchBtn = document.getElementById("authSwitchBtn");

  if (mode === "register") {
    if(title) title.textContent = "REGISTER";
    if(submit) submit.textContent = "CREATE ACCOUNT";
    if(nameField) nameField.style.display = "block";
    if(passField) passField.style.display = "block";
    if(googleSection) googleSection.style.display = "block";
    if(forgotRow) forgotRow.style.display = "none";
    if(switchBtn) switchBtn.textContent = "Switch to Login";
  } else if (mode === "login") {
    if(title) title.textContent = "LOGIN";
    if(submit) submit.textContent = "LOGIN";
    if(nameField) nameField.style.display = "none";
    if(passField) passField.style.display = "block";
    if(googleSection) googleSection.style.display = "block";
    if(forgotRow) forgotRow.style.display = "block";
    if(switchBtn) switchBtn.textContent = "Switch to Register";
  } else if (mode === "forgot") {
    if(title) title.textContent = "RESET PASSWORD";
    if(submit) submit.textContent = "SEND RESET LINK";
    if(nameField) nameField.style.display = "none";
    if(passField) passField.style.display = "none";
    if(googleSection) googleSection.style.display = "none";
    if(forgotRow) forgotRow.style.display = "none";
    if(switchBtn) switchBtn.textContent = "Back to Login";
  }

  overlay?.classList.add("open");
}

function toggleAuthMode() {
  if (authMode === "register") openAuth("login");
  else if (authMode === "login") openAuth("register");
  else openAuth("login");
}

async function checkSession(){
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentUser = session?.user || null;
    if (currentUser) {
      const { data: p } = await supabaseClient.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
      currentProfile = p || { id: currentUser.id, display_name: currentUser.email.split("@")[0], username: "artist" };
    } else {
      currentProfile = null;
    }
  } catch (err) {
    currentUser = null;
    currentProfile = null;
  }
  
  const adminBtn = document.getElementById("adminMenuBtn");
  if(adminBtn){
    const isAdmin = currentUser && (ADMIN_EMAILS.includes(currentUser.email) || currentProfile?.username === "admin");
    adminBtn.style.display = isAdmin ? "block" : "none";
  }

  renderProfile();
  const authBtn = document.getElementById("authMenuButton");
  if (authBtn) authBtn.textContent = currentUser ? "Logout" : "Register / Login";
}

async function signInWithGoogle(){
  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname }
    });
    if (error) throw error;
  } catch(e) {
    toast(e.message || "Google Sign-In failed.");
  }
}

async function submitAuth(){
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword")?.value;
  const nameInput = document.getElementById("authDisplayName");
  const name = nameInput?.value.trim() || email.split("@")[0];

  if (!email) return toast("Enter your email.");
  if (authMode !== "forgot" && !password) return toast("Enter password.");

  const fbOverlay = document.getElementById("authFeedbackOverlay");
  const spinner = document.getElementById("authSpinner");
  const checkmark = document.getElementById("authCheckmark");
  const fbText = document.getElementById("authFeedbackText");

  if(spinner) spinner.style.display = "block";
  if(checkmark) checkmark.style.display = "none";
  if(fbText) fbText.textContent = authMode === "forgot" ? "SENDING LINK..." : "VERIFYING...";
  fbOverlay?.classList.add("show");

  try {
    if (authMode === "register") {
      const { data, error } = await supabaseClient.auth.signUp({
        email, password, options: { data: { display_name: name } }
      });
      if (error) throw error;
      currentUser = data.user;
      if (currentUser) {
        await supabaseClient.from("profiles").upsert({ id: currentUser.id, display_name: name, username: email.split("@")[0] });
        await supabaseClient.from("artists").insert({ user_id: currentUser.id, name, username: email.split("@")[0] });
      }
      if(fbText) fbText.textContent = "ACCOUNT CREATED!";
    } else if (authMode === "login") {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentUser = data.user;
      if(fbText) fbText.textContent = "WELCOME BACK!";
    } else if (authMode === "forgot") {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
      });
      if (error) throw error;
      if(fbText) fbText.textContent = "RESET LINK SENT!";
    }

    if(spinner) spinner.style.display = "none";
    if(checkmark) checkmark.style.display = "grid";

    setTimeout(async () => {
      fbOverlay?.classList.remove("show");
      document.getElementById("authOverlay")?.classList.remove("open");
      document.getElementById("authEmail").value = "";
      if(document.getElementById("authPassword")) document.getElementById("authPassword").value = "";

      loadedPages.clear();
      await checkSession();
      await loadInitialHomeData();
      applyRoute(false);
    }, 1100);

  } catch(e) {
    fbOverlay?.classList.remove("show");
    toast(e.message || "Authentication failed.");
  }
}

async function logout(){
  await supabaseClient.auth.signOut();
  currentUser = null;
  currentProfile = null;
  liked.clear();
  loadedPages.clear();
  renderProfile();
  renderLibrary();
  const adminBtn = document.getElementById("adminMenuBtn");
  if(adminBtn) adminBtn.style.display = "none";
  toast("Logged out.");
}

async function loadInitialHomeData(){
  const loader = document.getElementById("homeLoader");
  if (loader) loader.classList.add("show");
  
  await loadArtists();
  await loadTracks();
  
  if (loader) loader.classList.remove("show");
  loadedPages.add("home");
}

async function loadArtists(){
  try {
    const { data } = await supabaseClient.from("artists").select("id,user_id,name,username");
    const rows = data || [];
    const ids = rows.map(a => a.user_id).filter(Boolean);
    let profiles = [];
    if (ids.length) {
      const pr = await supabaseClient.from("profiles").select("id,avatar_url,display_name,username").in("id", ids);
      if (!pr.error) profiles = pr.data || [];
    }
    const pmap = new Map(profiles.map(p => [p.id, p]));
    artists = rows.map(a => {
      const p = pmap.get(a.user_id) || {};
      return { id: a.id, userId: a.user_id, name: a.name || p.display_name || "Artist", username: a.username || p.username || "", avatar: p.avatar_url || "" };
    });
  } catch(e){ artists = []; }
}

async function loadTracks(){
  try {
    let result = await supabaseClient
      .from("tracks")
      .select("id,artist_id,title,description,cover_url,audio_url,video_url,duration_seconds,play_count,created_at,artists(id,user_id,name,username)")
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    const { data, error } = result;
    if (error || !data) return;
    
    tracks = data.map(t => {
      const a = Array.isArray(t.artists) ? t.artists[0] : t.artists;
      return {
        id: t.id,
        artistId: t.artist_id,
        artistUserId: a?.user_id || "",
        title: t.title,
        description: t.description || "",
        cover: t.cover_url,
        audio: t.audio_url,
        video: t.video_url || "",
        isFeatured: t.is_featured || false,
        duration: formatSeconds(t.duration_seconds || 0),
        artist: a?.name || "Unknown Artist",
        username: a?.username || "",
        plays: t.play_count || 0,
        date: formatDate(t.created_at)
      };
    });
    
    renderLatestList();
  } catch(e) {}
}

async function loadLikes(){
  if (!currentUser) {
    liked.clear();
    renderLibrary();
    return;
  }
  const { data } = await supabaseClient.from("track_likes").select("track_id").eq("user_id", currentUser.id);
  liked = new Set((data || []).map(x => x.track_id));
  updateFullLikeBtn();
  renderLibrary();
}

function renderLatestList(){
  const container = document.getElementById("latestList");
  if (!container) return;
  container.innerHTML = tracks.map((t, i) => trackRowHTML(t, i)).join("");
  bindTrackClicks(container);
}

function trackRowHTML(t, i){
  const artist = artistById(t.artistId);
  const avatar = artist?.avatar ? `<img class="avatar-badge" data-artist-avatar="${t.artistId}" src="${safeURL(artist.avatar)}" alt="">` : `<div class="avatar-badge-fallback" data-artist-avatar="${t.artistId}">${escapeHTML((t.artist||"A")[0].toUpperCase())}</div>`;
  const isPlaying = currentIndex >= 0 && tracks[currentIndex]?.id === t.id && !audio.paused;

  return `
    <div class="track-row">
      <div class="track-thumb-wrap">
        ${avatar}
        <img class="track-thumb" src="${safeURL(t.cover)}" alt="">
      </div>
      <button class="track-play-btn" data-play-index="${i}">${isPlaying ? "Ⅱ" : "▶"}</button>
      <div class="track-meta" data-track-meta="${i}">
        <h4>${escapeHTML(t.title)}</h4>
        <div class="artist-name">${escapeHTML(t.artist)}</div>
        <div class="track-stats"><span>${t.date}</span><span>•</span><span data-play-count-id="${t.id}">${Number(t.plays||0).toLocaleString()} plays</span></div>
      </div>
      <div class="track-more-btn" data-track-sheet="${t.id}">⋮</div>
    </div>
  `;
}

function bindTrackClicks(container){
  container.querySelectorAll("[data-play-index]").forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation();
      const i = Number(b.dataset.playIndex);
      if (currentIndex === i && !audio.paused) audio.pause(); else playIndex(i);
    };
  });
  container.querySelectorAll("[data-track-meta]").forEach(b => {
    b.onclick = () => playIndex(Number(b.dataset.trackMeta));
  });
  container.querySelectorAll("[data-artist-avatar]").forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation();
      navigate("artist", { artistId: b.dataset.artistAvatar });
    };
  });
  container.querySelectorAll("[data-track-sheet]").forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation();
      const t = tracks.find(x => String(x.id) === String(b.dataset.trackSheet));
      if (t) openTrackOptions(t);
    };
  });
}

function artistById(id){ return artists.find(a => String(a.id) === String(id)); }

function renderDiscover(){
  const promoSection = document.getElementById("featuredPromoSection");
  const promoTrack = tracks.find(t => t.isFeatured) || tracks[0];

  if (promoTrack && promoSection) {
    promoSection.style.display = "block";
    document.getElementById("promoCover").src = safeURL(promoTrack.cover);
    document.getElementById("promoTitle").textContent = promoTrack.title;
    document.getElementById("promoArtist").textContent = promoTrack.artist;
    document.getElementById("promoPlayBtn").onclick = () => playIndex(tracks.indexOf(promoTrack));
  }

  const stage = document.getElementById("coverflowStage");
  if (!stage || !tracks.length) return;

  stage.innerHTML = tracks.map((t, i) => `
    <div class="coverflow-item" data-cf-index="${i}" onclick="handleCoverflowClick(${i})">
      <img src="${safeURL(t.cover)}" alt="">
      <div class="cf-meta">
        <h4>${escapeHTML(t.title)}</h4>
        <p>${escapeHTML(t.artist)}</p>
      </div>
    </div>
  `).join("");

  updateCoverflow3D();
  setupCoverflowGestures();
}

function updateCoverflow3D(){
  const items = document.querySelectorAll(".coverflow-item");
  if (!items.length) return;

  items.forEach((item, i) => {
    const offset = i - cfCurrentIndex;
    const absOffset = Math.abs(offset);

    if (absOffset > 3) {
      item.style.opacity = "0";
      item.style.pointerEvents = "none";
      item.style.transform = `translateX(${offset * 30}px) translateZ(-200px) scale(0.5)`;
      item.classList.remove("active");
    } else if (offset === 0) {
      item.style.opacity = "1";
      item.style.pointerEvents = "auto";
      item.style.zIndex = "40";
      item.style.filter = "none";
      item.style.transform = `translateX(0px) translateZ(40px) rotateY(0deg) scale(1.15)`;
      item.classList.add("active");
    } else {
      const direction = offset > 0 ? 1 : -1;
      const tx = offset * 34 + (direction * 18);
      const rotY = direction * -34; 
      const tz = -45 * absOffset;
      const scale = Math.max(0.7, 1 - (absOffset * 0.12));

      item.style.opacity = absOffset === 1 ? "0.9" : absOffset === 2 ? "0.6" : "0.2";
      item.style.pointerEvents = "auto";
      item.style.zIndex = `${30 - absOffset}`;
      item.style.filter = "brightness(0.75)";
      item.style.transform = `translateX(${tx}px) translateZ(${tz}px) rotateY(${rotY}deg) scale(${scale})`;
      item.classList.remove("active");
    }
  });
}

function handleCoverflowClick(index){
  if (index === cfCurrentIndex) {
    playIndex(index);
  } else {
    cfCurrentIndex = index;
    updateCoverflow3D();
  }
}

function setupCoverflowGestures(){
  const wrap = document.getElementById("coverflowWrap");
  if (!wrap) return;

  wrap.ontouchstart = (e) => {
    cfStartX = e.touches[0].clientX;
    cfIsDragging = true;
  };
  wrap.ontouchmove = (e) => { if (!cfIsDragging) return; };
  wrap.ontouchend = (e) => {
    if (!cfIsDragging) return;
    cfIsDragging = false;
    const diff = e.changedTouches[0].clientX - cfStartX;
    if (diff < -40 && cfCurrentIndex < tracks.length - 1) {
      cfCurrentIndex++;
      updateCoverflow3D();
    } else if (diff > 40 && cfCurrentIndex > 0) {
      cfCurrentIndex--;
      updateCoverflow3D();
    }
  };
}

function renderAdminPanel(){
  const list = document.getElementById("adminTrackList");
  if (!list) return;

  list.innerHTML = tracks.map(t => `
    <div class="admin-track-item">
      <div class="admin-track-info">
        <h4>${escapeHTML(t.title)}</h4>
        <p>${escapeHTML(t.artist)} • ${t.plays} plays</p>
      </div>
      <button class="admin-toggle-btn ${t.isFeatured ? 'featured' : ''}" onclick="toggleFeaturedTrack('${t.id}', ${t.isFeatured})">
        ${t.isFeatured ? '★ Promoted (Active)' : '☆ Set as Promoted'}
      </button>
    </div>
  `).join("");
}

async function toggleFeaturedTrack(trackId, currentStatus){
  try {
    if (!currentStatus) {
      await supabaseClient.from("tracks").update({ is_featured: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    }

    const { error } = await supabaseClient.from("tracks").update({ is_featured: !currentStatus }).eq("id", trackId);
    if (error) throw error;

    toast(!currentStatus ? "Track set as Top Promoted!" : "Promoted track removed.");
    loadedPages.clear();
    await loadTracks();
    renderAdminPanel();
  } catch(e) {
    toast(e.message || "Failed to update status.");
  }
}

function animateSearchPill(){
  const pill = document.getElementById("searchPill");
  const input = document.getElementById("searchInput");
  if (!pill) return;
  
  pill.classList.remove("expanded");
  setTimeout(() => {
    pill.classList.add("expanded");
    if (input) input.focus();
  }, 80);
}

function runSearch(){
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const box = document.getElementById("searchResults");
  if (!q) { box.innerHTML = ""; return; }
  
  const ar = artists.filter(a => (a.name + " " + a.username).toLowerCase().includes(q));
  const tr = tracks.filter(t => (t.title + " " + t.artist).toLowerCase().includes(q));
  
  let out = "";
  if (ar.length) {
    out += `<div class="search-group-title">ARTISTS & CHANNELS</div>` + ar.map(a => `
      <div class="artist-result" onclick="navigate('artist', { artistId: '${a.id}' })">
        ${a.avatar ? `<img src="${safeURL(a.avatar)}">` : `<div class="artist-fallback">${(a.name||"A")[0].toUpperCase()}</div>`}
        <div><strong>${escapeHTML(a.name)}</strong><br><small style="color:var(--gray)">@${escapeHTML(a.username)}</small></div>
      </div>
    `).join("");
  }
  if (tr.length) {
    out += `<div class="search-group-title">TRACKS</div>` + tr.map(t => trackRowHTML(t, tracks.indexOf(t))).join("");
  }
  box.innerHTML = out || "<p style='font-size:11px;color:var(--gray);margin-top:10px'>No results.</p>";
  bindTrackClicks(box);
}

function renderProfile(){
  const pName = document.getElementById("profileName"), pUser = document.getElementById("profileUsername"), pActs = document.getElementById("profileActions"), pTracks = document.getElementById("profileTracks");
  const avatarImg = document.getElementById("profileAvatar"), fallback = document.getElementById("profileAvatarFallback");
  
  if (!currentUser) {
    if(pName) pName.textContent = "LOST SOUND";
    if(pUser) pUser.textContent = "@guest";
    if(avatarImg) avatarImg.style.display = "none";
    if(fallback) fallback.style.display = "grid";
    if(pActs) pActs.innerHTML = `<button class="small-btn" onclick="openAuth('login')">Login / Register</button>`;
    if(pTracks) pTracks.innerHTML = "<p style='font-size:11px;color:var(--gray);margin-top:10px'>Login to view your tracks.</p>";
    return;
  }

  if(pName) pName.textContent = currentProfile?.display_name || "Artist";
  if(pUser) pUser.textContent = "@" + (currentProfile?.username || "user");
  if (currentProfile?.avatar_url) {
    if(avatarImg){ avatarImg.src = currentProfile.avatar_url; avatarImg.style.display = "block"; }
    if(fallback) fallback.style.display = "none";
  } else {
    if(avatarImg) avatarImg.style.display = "none";
    if(fallback) fallback.style.display = "grid";
  }

  if(pActs) pActs.innerHTML = `<button class="small-btn" onclick="navigate('editProfile')">Edit Profile</button><button class="small-btn" onclick="navigate('upload')">+ Upload</button><button class="small-btn" onclick="logout()">Logout</button>`;
  
  const mine = tracks.filter(t => t.artistUserId === currentUser.id);
  if(pTracks){
    pTracks.innerHTML = mine.length ? mine.map((t, i) => trackRowHTML(t, tracks.indexOf(t))).join("") : "<p style='font-size:11px;color:var(--gray);margin-top:10px'>No uploads yet.</p>";
    bindTrackClicks(pTracks);
  }
}

function renderArtistChannel(id){
  const a = artistById(id), c = document.getElementById("artistPage");
  if (!c) return;
  if (!a) { c.innerHTML = "<p style='padding:20px'>Channel not found.</p>"; return; }
  const mine = tracks.filter(t => String(t.artistId) === String(a.id));
  const av = a.avatar ? `<img class="channel-avatar" src="${safeURL(a.avatar)}">` : `<div class="channel-avatar artist-fallback">${(a.name||"A")[0].toUpperCase()}</div>`;
  const isOwner = currentUser && a.userId === currentUser.id;

  c.innerHTML = `
    <div class="channel-hero">
      ${av}
      <div class="channel-meta">
        <div class="hero-meta-top">ARTIST CHANNEL</div>
        <h2>${escapeHTML(a.name)}</h2>
        <div class="channel-id">@${escapeHTML(a.username || a.id)}</div>
        <div class="channel-actions">
          ${isOwner ? `<button class="small-btn" id="editChannelBtn">✎ Edit Channel</button>` : ''}
          <button class="small-btn" id="shareChannelBtn">↗ Share Profile</button>
        </div>
      </div>
    </div>
    <div class="section-title-line"><div class="section-title">RELEASES (${mine.length})</div></div>
    <div id="channelTrackList">${mine.length ? mine.map(t => trackRowHTML(t, tracks.indexOf(t))).join("") : "<p style='font-size:11px;color:var(--gray)'>No tracks.</p>"}</div>
  `;
  bindTrackClicks(c);
  document.getElementById("shareChannelBtn").onclick = () => shareProfile(a);
  if (isOwner) {
    document.getElementById("editChannelBtn").onclick = () => navigate("editProfile");
  }
}

function renderLibrary(){
  const c = document.getElementById("likedList");
  if (!c) return;
  const lt = tracks.filter(t => liked.has(t.id));
  c.innerHTML = lt.length ? lt.map(t => trackRowHTML(t, tracks.indexOf(t))).join("") : "<p style='font-size:11px;color:var(--gray);margin-top:10px'>No saved tracks yet. Like any track to add it here.</p>";
  bindTrackClicks(c);
}

function selectTrack(i){
  if (i < 0 || i >= tracks.length) return;
  currentIndex = i;
  currentTrackObj = tracks[i];
  listeningSeconds = 0;
  lastAudioTime = 0;

  document.getElementById("dockTitle").textContent = currentTrackObj.title;
  document.getElementById("dockArtist").textContent = currentTrackObj.artist;
  document.getElementById("dockImg").src = currentTrackObj.cover;
  document.getElementById("dockPlayer").classList.add("open");

  const ft = document.getElementById("fullTitle");
  if(ft) ft.textContent = currentTrackObj.title;
  const fa = document.getElementById("fullArtist");
  if(fa) fa.textContent = currentTrackObj.artist;
  const fc = document.getElementById("fullCoverImg");
  if(fc) fc.src = currentTrackObj.cover;

  const fv = document.getElementById("fullCoverVideo");
  if (fv) {
    if (currentTrackObj.video) {
      fv.src = currentTrackObj.video;
      fv.oncanplay = () => { fv.style.display = "block"; if (!audio.paused) fv.play().catch(()=>{}); };
      fv.load();
    } else {
      fv.removeAttribute("src");
      fv.style.display = "none";
    }
  }

  updateFullLikeBtn();
}

function playIndex(i){
  if (i < 0 || i >= tracks.length) return;
  selectTrack(i);
  if (currentTrackObj.audio) {
    audio.src = currentTrackObj.audio;
    audio.load();
    audio.play().catch(()=>{});
  }
  renderLatestList();
}

function togglePlay(){
  if (currentIndex < 0) { if (tracks.length) playIndex(0); return; }
  if (audio.paused) audio.play().catch(()=>{}); else audio.pause();
}

function nextTrack(){ if (tracks.length) playIndex((currentIndex + 1) % tracks.length); }

function updateProgress(){
  if (!audio.duration) return;

  if (!audio.paused && audio.currentTime > 0) {
    const timeDelta = audio.currentTime - lastAudioTime;
    if (timeDelta > 0 && timeDelta < 1.5) {
      listeningSeconds += timeDelta;
      if (listeningSeconds >= 60) {
        listeningSeconds = 0;
        if (currentTrackObj) countPlay(currentTrackObj);
      }
    }
  }
  lastAudioTime = audio.currentTime;

  const pct = (audio.currentTime / audio.duration) * 100;
  
  const dpb = document.getElementById("dockProgressBar");
  if(dpb) dpb.style.width = pct + "%";
  const dct = document.getElementById("dockCurrentTime");
  if(dct) dct.textContent = formatSeconds(audio.currentTime);
  const dd = document.getElementById("dockDuration");
  if(dd) dd.textContent = formatSeconds(audio.duration);

  const fsf = document.getElementById("fullScrubFill");
  if(fsf) fsf.style.width = pct + "%";
  const fct = document.getElementById("fullCurrentTime");
  if(fct) fct.textContent = formatSeconds(audio.currentTime);
  const fd = document.getElementById("fullDuration");
  if(fd) fd.textContent = formatSeconds(audio.duration);
}

async function countPlay(track){
  if (!track?.id) return;
  track.plays = Number(track.plays || 0) + 1;
  document.querySelectorAll(`[data-play-count-id="${track.id}"]`).forEach(el => el.textContent = `${track.plays} plays`);
  try { await supabaseClient.rpc("increment_play_count", { track_id: track.id }); } catch(e){}
}

function seekAudio(e){
  if (!audio.duration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  lastAudioTime = audio.currentTime;
}

function seekAudioFull(e){
  if (!audio.duration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  lastAudioTime = audio.currentTime;
}

async function toggleLikeCurrent(){
  if (!currentUser) return openAuth("login");
  if (!currentTrackObj) return;
  const id = currentTrackObj.id;
  if (liked.has(id)) {
    await supabaseClient.from("track_likes").delete().eq("user_id", currentUser.id).eq("track_id", id);
    liked.delete(id);
    toast("Removed from Library");
  } else {
    await supabaseClient.from("track_likes").insert({ user_id: currentUser.id, track_id: id });
    liked.add(id);
    toast("Saved to Library!");
  }
  updateFullLikeBtn();
  renderLibrary();
}

function updateFullLikeBtn(){
  const btn = document.getElementById("fullLikeBtn");
  if (!btn || !currentTrackObj) return;
  const isLiked = liked.has(currentTrackObj.id);
  btn.textContent = isLiked ? "♥" : "♡";
  btn.classList.toggle("liked", isLiked);
}

function startCropping(file, target){
  if (!file) return;
  cropTarget = target;
  const stage = document.getElementById("cropStage");
  if (target === "profile") {
    stage.className = "crop-stage circle";
    document.getElementById("cropLabel").textContent = "ADJUST PROFILE PHOTO";
  } else {
    stage.className = "crop-stage square";
    document.getElementById("cropLabel").textContent = "ADJUST COVER ARTWORK";
  }

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    cropFile = file; cropImage = img; cropScale = 1; cropX = 0; cropY = 0;
    document.getElementById("cropZoom").value = "1";
    document.getElementById("cropOverlay").classList.add("open");
    drawCrop();
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

function drawCrop(){
  const canvas = document.getElementById("cropCanvas"), ctx = canvas.getContext("2d"), s = canvas.width;
  ctx.clearRect(0, 0, s, s); ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, s, s);
  if (!cropImage) return;

  const base = Math.max(s / cropImage.naturalWidth, s / cropImage.naturalHeight);
  const w = cropImage.naturalWidth * base * cropScale, h = cropImage.naturalHeight * base * cropScale;
  const x = (s - w) / 2 + cropX, y = (s - h) / 2 + cropY;

  ctx.save();
  ctx.beginPath();
  if (cropTarget === "profile") ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  else ctx.rect(0, 0, s, s);
  ctx.clip();
  ctx.drawImage(cropImage, x, y, w, h);
  ctx.restore();
}

function cropPointerStart(e){ if (!cropImage) return; cropDragging = true; const p = e.touches?.[0] || e; cropLastX = p.clientX; cropLastY = p.clientY; }
function cropPointerMove(e){ if (!cropDragging) return; const p = e.touches?.[0] || e; cropX += p.clientX - cropLastX; cropY += p.clientY - cropLastY; cropLastX = p.clientX; cropLastY = p.clientY; drawCrop(); e.preventDefault(); }
function cropPointerEnd(){ cropDragging = false; }

async function applyCroppedImage(){
  if (!cropImage) return;
  const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 400;
  const ctx = canvas.getContext("2d"), s = 400;
  const base = Math.max(s / cropImage.naturalWidth, s / cropImage.naturalHeight);
  const w = cropImage.naturalWidth * base * cropScale, h = cropImage.naturalHeight * base * cropScale;
  const x = (s - w) / 2 + cropX, y = (s - h) / 2 + cropY;

  ctx.save(); ctx.beginPath();
  if (cropTarget === "profile") ctx.arc(200, 200, 200, 0, Math.PI * 2);
  else ctx.rect(0, 0, s, s);
  ctx.clip();
  ctx.drawImage(cropImage, x, y, w, h);
  ctx.restore();

  canvas.toBlob(blob => {
    if (cropTarget === "profile") croppedAvatarBlob = blob;
    else if (cropTarget === "cover") croppedCoverBlob = blob;
    else if (cropTarget === "editCover") croppedEditCoverBlob = blob;
    
    document.getElementById("cropOverlay").classList.remove("open");
    toast("Image cropped & ready.");
  }, "image/jpeg", 0.85);
}

async function saveProfile(){
  if (!currentUser) return openAuth("login");
  const username = document.getElementById("editUsername").value.trim().toLowerCase();
  const displayName = document.getElementById("editDisplayName").value.trim();
  const newPassword = document.getElementById("editNewPassword").value;
  let avatarUrl = currentProfile?.avatar_url || null;

  const btn = document.getElementById("saveProfileButton");
  btn.disabled = true; btn.textContent = "SAVING...";

  try {
    if (newPassword) {
      if (newPassword.length < 6) throw new Error("Password must be at least 6 characters.");
      const { error: passErr } = await supabaseClient.auth.updateUser({ password: newPassword });
      if (passErr) throw passErr;
    }

    if (croppedAvatarBlob) {
      const path = `${currentUser.id}/avatar-${Date.now()}.jpg`;
      await supabaseClient.storage.from("avatars").upload(path, croppedAvatarBlob, { upsert: true, contentType: "image/jpeg" });
      avatarUrl = supabaseClient.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      croppedAvatarBlob = null;
    }

    await supabaseClient.from("profiles").upsert({ id: currentUser.id, username, display_name: displayName, avatar_url: avatarUrl });
    await supabaseClient.from("artists").update({ name: displayName, username }).eq("user_id", currentUser.id);
    
    await checkSession();
    await loadArtists();
    navigate("profile");
    toast("Profile & security updated!");
    document.getElementById("editNewPassword").value = "";
  } catch(e) { 
    toast(e.message || "Update failed."); 
  } finally {
    btn.disabled = false; btn.textContent = "SAVE PROFILE";
  }
}

async function publishTrack(){
  if (!currentUser) return openAuth("login");
  const aFile = document.getElementById("audioFile").files[0];
  const cFile = croppedCoverBlob || document.getElementById("coverFile").files[0];
  const vFile = document.getElementById("videoFile").files[0];
  const title = document.getElementById("uploadTitle").value.trim();
  const artistName = document.getElementById("uploadArtist").value.trim();

  if (!aFile || !cFile || !title) return toast("Fill required fields.");

  const btn = document.getElementById("publishButton");
  const progressWrap = document.getElementById("uploadProgressWrap");
  const progressFill = document.getElementById("uploadProgressFill");
  const progressText = document.getElementById("uploadProgressText");

  btn.disabled = true; btn.textContent = "UPLOADING...";
  progressWrap.style.display = "block";
  progressFill.style.width = "0%";
  progressText.textContent = "0%";

  function updateUploadProgress(pct){
    progressFill.style.width = pct + "%";
    progressText.textContent = Math.round(pct) + "%";
  }

  try {
    let { data: art } = await supabaseClient.from("artists").select("*").eq("user_id", currentUser.id).maybeSingle();
    if (!art) {
      const { data: newArt } = await supabaseClient.from("artists").insert({ user_id: currentUser.id, name: artistName || "Artist", username: currentProfile?.username || "artist" }).select().single();
      art = newArt;
    }

    const totalWeight = (aFile?.size || 0) + (cFile?.size || 0) + (vFile?.size || 0);
    let uploadedBytes = 0;

    updateUploadProgress(10);

    const cPath = `${currentUser.id}/${Date.now()}-cover.jpg`;
    await supabaseClient.storage.from("covers").upload(cPath, cFile, { upsert: false, contentType: "image/jpeg" });
    uploadedBytes += (cFile?.size || 0);
    updateUploadProgress(totalWeight ? (uploadedBytes / totalWeight) * 85 : 40);

    const aPath = `${currentUser.id}/${Date.now()}-track.mp3`;
    await supabaseClient.storage.from("audio").upload(aPath, aFile, { upsert: false });
    uploadedBytes += (aFile?.size || 0);
    updateUploadProgress(totalWeight ? (uploadedBytes / totalWeight) * 85 : 75);

    let vUrl = null;
    if (vFile) {
      const vPath = `${currentUser.id}/${Date.now()}-video.mp4`;
      await supabaseClient.storage.from("videos").upload(vPath, vFile, { upsert: false });
      vUrl = supabaseClient.storage.from("videos").getPublicUrl(vPath).data.publicUrl;
    }

    const aUrl = supabaseClient.storage.from("audio").getPublicUrl(aPath).data.publicUrl;
    const cUrl = supabaseClient.storage.from("covers").getPublicUrl(cPath).data.publicUrl;

    updateUploadProgress(92);

    await supabaseClient.from("tracks").insert({
      artist_id: art.id, title, cover_url: cUrl, audio_url: aUrl, video_url: vUrl, play_count: 0, is_published: true, is_featured: false
    });

    updateUploadProgress(100);

    setTimeout(async () => {
      toast("Track published!");
      document.getElementById("audioFile").value = "";
      document.getElementById("coverFile").value = "";
      document.getElementById("videoFile").value = "";
      croppedCoverBlob = null;
      progressWrap.style.display = "none";
      loadedPages.clear();
      await loadTracks();
      navigate("home");
    }, 400);

  } catch(e) {
    toast(e.message || "Upload failed.");
    progressWrap.style.display = "none";
  } finally {
    btn.disabled = false; btn.textContent = "PUBLISH TRACK";
  }
}

function openTrackOptions(t){
  selectedOptionTrack = t;
  document.getElementById("optionsTrackTitle").textContent = t.title;
  const isOwner = currentUser && t.artistUserId === currentUser.id;
  document.getElementById("optEditTrack").style.display = isOwner ? "block" : "none";
  document.getElementById("optDeleteTrack").style.display = isOwner ? "block" : "none";
  document.getElementById("trackOptionsSheet").classList.add("open");
}
function closeTrackOptions(){ document.getElementById("trackOptionsSheet").classList.remove("open"); }

function openEditTrack(t){
  document.getElementById("editTrackId").value = t.id;
  document.getElementById("editTrackTitle").value = t.title;
  document.getElementById("editTrackArtist").value = t.artist;
  croppedEditCoverBlob = null;
  navigate("editTrack");
}

async function saveTrackEdit(){
  const id = document.getElementById("editTrackId").value;
  const title = document.getElementById("editTrackTitle").value.trim();
  if (!id || !title) return toast("Fill title.");

  const btn = document.getElementById("saveTrackButton");
  btn.disabled = true; btn.textContent = "SAVING...";

  try {
    let updatePayload = { title };
    if (croppedEditCoverBlob) {
      const cPath = `${currentUser.id}/${Date.now()}-editcover.jpg`;
      await supabaseClient.storage.from("covers").upload(cPath, croppedEditCoverBlob, { upsert: false, contentType: "image/jpeg" });
      updatePayload.cover_url = supabaseClient.storage.from("covers").getPublicUrl(cPath).data.publicUrl;
      croppedEditCoverBlob = null;
    }
    await supabaseClient.from("tracks").update(updatePayload).eq("id", id);
    toast("Track updated!");
    loadedPages.clear();
    await loadTracks();
    navigate("profile");
  } catch(e){
    toast("Edit failed.");
  } finally {
    btn.disabled = false; btn.textContent = "UPDATE TRACK";
  }
}

async function deleteTrack(t){
  if (!confirm(`Delete "${t.title}" permanently?`)) return;
  try {
    await supabaseClient.from("tracks").delete().eq("id", t.id);
    toast("Track deleted.");
    loadedPages.clear();
    await loadTracks();
  } catch(e){ toast("Delete failed."); }
}

function navigate(view, opts = {}){
  const u = new URL(location.href);
  u.search = "";
  if (view && view !== "home") u.searchParams.set("view", view);
  if (view === "artist" && opts.artistId) u.searchParams.set("artist", opts.artistId);
  history.pushState({ view, ...opts }, "", u.href);
  applyRoute(false);
}

function updatePillGlider(viewName){
  const navMap = { "home": 0, "discover": 1, "search": 2, "library": 3, "profile": 4 };
  const idx = navMap[viewName] !== undefined ? navMap[viewName] : 0;
  
  const glider = document.getElementById("pillGlider");
  if (glider) {
    glider.style.transform = `translateX(${idx * 100}%)`;
  }
  document.querySelectorAll(".pill-item").forEach(item => {
    item.classList.toggle("active", item.dataset.view === viewName);
  });
}

async function applyRoute(fromPop = true){
  const p = new URLSearchParams(location.search), view = p.get("view") || "home";
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("siteBackButton")?.classList.toggle("visible", !!p.get("view"));

  updatePillGlider(view);

  const activeViewEl = document.getElementById(view);
  if (activeViewEl) activeViewEl.classList.add("active");

  if (view === "home") {
    if (!loadedPages.has("home")) await loadInitialHomeData();
  } else if (view === "discover") {
    const loader = document.getElementById("discoverLoader");
    if (!loadedPages.has("discover")) {
      if (loader) loader.classList.add("show");
      renderDiscover();
      if (loader) loader.classList.remove("show");
      loadedPages.add("discover");
    } else {
      renderDiscover();
    }
  } else if (view === "admin") {
    renderAdminPanel();
  } else if (view === "search") {
    animateSearchPill();
  } else if (view === "library") {
    const loader = document.getElementById("libraryLoader");
    if (!loadedPages.has("library")) {
      if (loader) loader.classList.add("show");
      await loadLikes();
      if (loader) loader.classList.remove("show");
      loadedPages.add("library");
    } else {
      renderLibrary();
    }
  } else if (view === "profile") {
    renderProfile();
  } else if (view === "artist") {
    renderArtistChannel(p.get("artist"));
  }

  if (!fromPop) window.scrollTo(0, 0);
}

window.addEventListener("popstate", () => applyRoute(true));
function goBack(){ history.length > 1 ? history.back() : navigate("home"); }

function shareProfile(a){
  const url = `${location.origin}${location.pathname}?view=artist&artist=${a.id}`;
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast("Channel link copied!"));
}

function shareTrack(t){
  const trk = t || (currentIndex >= 0 ? tracks[currentIndex] : null);
  if (!trk) return;
  const url = `${location.origin}${location.pathname}?view=track&id=${trk.id}`;
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast("Track link copied!"));
}

function formatSeconds(s){ if (!isFinite(s)) return "0:00"; return Math.floor(s/60) + ":" + String(Math.floor(s%60)).padStart(2, "0"); }
function formatDate(d){ if (!d) return "Recently"; return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d)); }
function toast(m){ document.querySelector(".toast")?.remove(); const e = document.createElement("div"); e.className = "toast"; e.textContent = m; document.body.appendChild(e); setTimeout(() => e.remove(), 2200); }
function escapeHTML(v){ return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function safeURL(v){ return String(v??"").replace(/"/g,"%22"); }
