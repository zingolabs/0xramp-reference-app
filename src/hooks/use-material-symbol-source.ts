import { unstable_getMaterialSymbolSourceAsync, type AndroidSymbol } from "expo-symbols";
import { useEffect, useState } from "react";
import type { ImageSourcePropType } from "react-native";

export function useMaterialSymbolSource(symbol: AndroidSymbol): ImageSourcePropType | undefined {
  const [source, setSource] = useState<ImageSourcePropType>();

  useEffect(() => {
    if (process.env.EXPO_OS !== "android") {
      return;
    }
    let current = true;
    unstable_getMaterialSymbolSourceAsync(symbol, 24, "#000000").then((image) => {
      if (current && image) {
        setSource(image);
      }
    });
    return () => {
      current = false;
    };
  }, [symbol]);

  return source;
}
