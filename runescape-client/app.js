const playerNameKey = 'runescape-companion-player-name';

const connectionState = document.getElementById('connection-state');
const loginStatus = document.getElementById('login-status');
const playerName = document.getElementById('player-name');
const savedNameLabel = document.getElementById('saved-name-label');
const identityStatus = document.getElementById('identity-status');
const loginButton = document.getElementById('login-button');

let hub = null;
try {
    const activityhub = await import('activityhub');
    hub = await activityhub.connect();
} catch {
    // The standalone browser preview has no ActivityHub module.
}

const savedName = localStorage.getItem(playerNameKey) || '';
playerName.value = savedName;
updateNameLabels(savedName);

loginButton.addEventListener('click', async (event) => {
    if (hub && !hub.offline && hub.discord?.commands?.openExternalLink) {
        event.preventDefault();
        await hub.discord.commands.openExternalLink({ url: loginButton.href });
    }
    connectionState.textContent = 'Official site opened';
    loginStatus.textContent = 'Finish signing in on the official RuneScape tab. This page cannot read that session.';
});

document.getElementById('save-name').addEventListener('click', () => {
    const name = playerName.value.trim();
    if (!name) {
        localStorage.removeItem(playerNameKey);
        updateNameLabels('');
        identityStatus.textContent = 'No name saved.';
        return;
    }
    localStorage.setItem(playerNameKey, name);
    updateNameLabels(name);
    identityStatus.textContent = 'Saved locally in this browser.';
});

document.getElementById('copy-name').addEventListener('click', async () => {
    const name = localStorage.getItem(playerNameKey) || '';
    if (!name) {
        identityStatus.textContent = 'Set a player name first.';
        showView('identity');
        return;
    }
    await navigator.clipboard.writeText(name);
    savedNameLabel.textContent = 'Copied to clipboard';
    window.setTimeout(() => updateNameLabels(name), 1600);
});

document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => showView(item.dataset.view));
});

function showView(viewName) {
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === viewName));
    document.querySelectorAll('.view').forEach((view) => {
        const active = view.id === viewName;
        view.hidden = !active;
        view.classList.toggle('active-view', active);
    });
}

function updateNameLabels(name) {
    const label = name || 'Not set';
    savedNameLabel.textContent = label;
    identityStatus.textContent = name ? 'Saved locally in this browser.' : 'No name saved.';
}
