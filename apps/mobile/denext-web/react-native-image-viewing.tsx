// Web build only (denext React Native mode, deno.json "imports"): react-native-image-viewing
// ships its ImageItem as .ios / .android files only, so its own entry cannot build for the web.
// This is the subset apps/mobile uses: one full-screen modal over the image, closed by a tap on
// the backdrop or the header.
import type { ComponentType } from "react";
import { Image, Modal, Pressable, View } from "react-native";

type ImageSource = { uri?: string } | number;

type Props = {
  images: ImageSource[];
  imageIndex: number;
  visible: boolean;
  onRequestClose: () => void;
  presentationStyle?: "fullScreen" | "pageSheet" | "formSheet" | "overFullScreen";
  animationType?: "none" | "slide" | "fade";
  backgroundColor?: string;
  swipeToCloseEnabled?: boolean;
  doubleTapToZoomEnabled?: boolean;
  HeaderComponent?: ComponentType<{ imageIndex: number }>;
  FooterComponent?: ComponentType<{ imageIndex: number }>;
};

export default function ImageViewing(props: Props) {
  const { HeaderComponent, FooterComponent } = props;
  const source = props.images[props.imageIndex];
  return (
    <Modal
      transparent
      visible={props.visible}
      animationType={props.animationType ?? "fade"}
      onRequestClose={props.onRequestClose}
    >
      <View style={{ flex: 1, backgroundColor: props.backgroundColor ?? "#000" }}>
        <Pressable style={{ flex: 1 }} onPress={props.onRequestClose}>
          {source === undefined ? null : (
            <Image source={source} resizeMode="contain" style={{ flex: 1 }} />
          )}
        </Pressable>
        {HeaderComponent ? (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
            <HeaderComponent imageIndex={props.imageIndex} />
          </View>
        ) : null}
        {FooterComponent ? (
          <View style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
            <FooterComponent imageIndex={props.imageIndex} />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
