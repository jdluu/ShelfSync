# Testing Strategy

ShelfSync prioritizes quality through automated verification of core synchronization workflows.

## End to End (E2E) Testing
The project uses Playwright for comprehensive multi instance testing. The suite simulates the interaction between a Host and a Client instance to verify that discovery, pairing, and synchronization function correctly.

### Test Environment
- **Tauri Fixture**: A custom Playwright fixture facilitates connection to the Tauri application via the Chrome DevTools Protocol (CDP).
- **Network Mocking**: Network requests and certain Tauri API calls are mocked during testing to ensure consistent results in various environments.

### Key Scenarios
- **Role Selection**: Verification of the initial setup flow.
- **Host Discovery**: Testing the automatic identification of hosts on the network.
- **Library Sync**: Validation of metadata transfer and download progress tracking.
- **Responsive Layouts**: Verification of UI integrity across different simulated device resolutions.

## Running Tests
To execute the testing suite locally:
1. Ensure the development server is running (`pnpm dev`).
2. Run the E2E command: `pnpm run test:e2e`.

Continuous Integration (CI) pulls are automatically verified using the same suite on every push to the repository.
