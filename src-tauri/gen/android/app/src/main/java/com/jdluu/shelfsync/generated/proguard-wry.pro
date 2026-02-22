# THIS FILE IS AUTO-GENERATED. DO NOT MODIFY!!

# Copyright 2020-2023 Tauri Programme within The Commons Conservancy
# SPDX-License-Identifier: Apache-2.0
# SPDX-License-Identifier: MIT

-keep class com.j2013.shelfsync.* {
  native <methods>;
}

-keep class com.j2013.shelfsync.WryActivity {
  public <init>(...);

  void setWebView(com.j2013.shelfsync.RustWebView);
  java.lang.Class getAppClass(...);
  java.lang.String getVersion();
}

-keep class com.j2013.shelfsync.Ipc {
  public <init>(...);

  @android.webkit.JavascriptInterface public <methods>;
}

-keep class com.j2013.shelfsync.RustWebView {
  public <init>(...);

  void loadUrlMainThread(...);
  void loadHTMLMainThread(...);
  void evalScript(...);
}

-keep class com.j2013.shelfsync.RustWebChromeClient,com.j2013.shelfsync.RustWebViewClient {
  public <init>(...);
}
