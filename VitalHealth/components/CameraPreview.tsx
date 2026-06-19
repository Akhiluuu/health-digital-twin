import { requireNativeComponent, Platform, View } from "react-native";

let CameraPreview: any;

if (Platform.OS === "android") {
  const globalAny = global as any;
  if (!globalAny.__cameraPreviewComponent) {
    globalAny.__cameraPreviewComponent = requireNativeComponent("CameraPreview" as any);
  }
  CameraPreview = globalAny.__cameraPreviewComponent;
} else {
  CameraPreview = View;
}

export default CameraPreview;
