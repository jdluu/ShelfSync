# Troubleshooting Guide

This guide addresses common issues encountered when setting up or using ShelfSync.

## Connectivity Issues

### Host Not Discovered
If the Client device cannot find the Host automatically:
- Ensure both devices are connected to the same local network (Wi-Fi or LAN).
- Check that the Host application is open and in Host Mode.
- Verify that your system firewall is not blocking incoming connections on the ShelfSync port (displayed on the Host Dashboard).
- Attempt to connect manually using the **Manual Connection** option with the Host IP address and Port.

### Connection Timed Out
- Verify that the Host device has not entered sleep mode.
- Ensure the network signal is stable on both devices.

## Synchronization Failures

### Download Errors
- Verify that the Client device has sufficient storage space.
- Ensure the Host library folder is accessible and has not been moved.
- Restart the synchronization process from the Client Dashboard.

### Library Loading Errors
- Confirm that the selected folder is a valid Calibre library containing a `metadata.db` file.
- Check the application logs for specific database error messages.

## Application Crashes
- Ensure you are running the latest version of the application.
- On Windows, verify that the WebView2 runtime is installed and up to date.
- Clear the application data directory if persistent configuration issues occur.

For further assistance, please refer to the technical documentation or the repository issue tracker.
