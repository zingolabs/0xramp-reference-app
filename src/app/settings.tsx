import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { ScrollView } from "react-native";

import { ListGroup, ListRow } from "@/components/list-group";
import { useColors } from "@/constants/colors";
import { INDEXER_LABEL, NETWORK_LABEL } from "@/constants/network";

const SWITCH_WARNING =
  "Removes this wallet from the device and returns to the start screen. Only its seed phrase can open it again.";

export default function Settings() {
  const colors = useColors();
  const router = useRouter();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.recessed }}
      contentContainerStyle={{ paddingTop: 4, paddingBottom: 28 }}
    >
      <ListGroup title="Wallet">
        <ListRow label="Network" value={NETWORK_LABEL} />
        <ListRow label="Indexer" value={INDEXER_LABEL} />
      </ListGroup>

      <ListGroup title="App">
        <ListRow label="Version" value={Constants.expoConfig?.version ?? "unknown"} />
      </ListGroup>

      <ListGroup footer={SWITCH_WARNING}>
        <ListRow label="Switch wallet" destructive onPress={() => router.push("/switch-wallet")} />
      </ListGroup>
    </ScrollView>
  );
}
