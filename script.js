document.addEventListener('DOMContentLoaded', () => {
    console.log("Diagnostic Mode: ON");

    const LASTFM_KEY = "533281fde87701480cd27a936bcaef0b";
    
    const seedArtistInput = document.getElementById('seedArtistInput');
    const discoverBtn = document.getElementById('discoverBtn');
    const discoveredTracksGrid = document.getElementById('discoveredTracksGrid');
    const loadingDiv = document.getElementById('loading');
    const errorDiv = document.getElementById('error');

    async function testLastFM() {
        const query = seedArtistInput.value.trim() || "trap";
        console.log("Attempting to fetch tracks for tag:", query);
        
        loadingDiv.style.display = 'block';
        errorDiv.style.display = 'none';

        try {
            // This is the simplest possible Last.fm URL
            const url = `https://ws.audioscrobbler.com/2.0/?method=tag.gettoptracks&tag=${encodeURIComponent(query)}&api_key=${LASTFM_KEY}&format=json&limit=10`;
            
            const response = await fetch(url);
            console.log("Last.fm Response Status:", response.status);
            
            const data = await response.json();
            console.log("Data Received:", data);

            if (data.tracks && data.tracks.track) {
                const tracks = data.tracks.track;
                console.log(`Found ${tracks.length} tracks.`);
                
                discoveredTracksGrid.innerHTML = tracks.map(t => `
                    <div style="border:1px solid #ccc; padding:10px; margin:5px;">
                        <h4>${t.name}</h4>
                        <p>by ${t.artist.name}</p>
                    </div>
                `).join('');
            } else {
                console.log("No tracks found in the data object.");
                discoveredTracksGrid.innerHTML = "<p>No tracks found. Check Console.</p>";
            }

        } catch (err) {
            console.error("Fetch Error:", err);
            errorDiv.textContent = "Error: " + err.message;
            errorDiv.style.display = 'block';
        } finally {
            loadingDiv.style.display = 'none';
        }
    }

    discoverBtn.addEventListener('click', testLastFM);
});