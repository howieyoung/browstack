import { rotateArchiveToken } from "../archiveToken.js";

// Rotate the archive token: buttons in old emails stop working immediately; the next issue ships with a new link.
rotateArchiveToken();
console.log("Archive token rotated (stored in Keychain: browstack-archive).");
console.log("Archive buttons in old emails stop working immediately; the next issue ships with a new link.");
console.log("To open the archive now, run: npm run archive:open");
