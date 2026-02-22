# THIS FILE IS AUTO-GENERATED. DO NOT MODIFY!!

# Copyright 2020-2023 Tauri Programme within The Commons Conservancy
# SPDX-License-Identifier: Apache-2.0
# SPDX-License-Identifier: MIT

-keep class com.jdluu.shelfsync.* {
  native <methods>;
}

-keep class com.jdluu.shelfsync.WryActivity {
  public <init>(...);

  void setWebView(com.jdluu.shelfsync.RustWebView);
  java.lang.Class getAppClass(...);
  java.lang.String getVersion();
}

-keep class com.jdluu.shelfsync.Ipc {
  public <init>(...);

  @android.webkit.JavascriptInterface public <methods>;
}

-keep class com.jdluu.shelfsync.RustWebView {
  public <init>(...);

  void loadUrlMainThread(...);
  void loadHTMLMainThread(...);
  void evalScript(...);
}

-keep class com.jdluu.shelfsync.RustWebChromeClient,com.jdluu.shelfsync.RustWebViewClient {
  public <init>(...);
}
