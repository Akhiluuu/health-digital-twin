import React, { useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { colors } from '../../theme/colors';

const pad = (n: number) => String(n).padStart(2, '0');

export default function TimePicker({
  value,
  onChange,
  accent = '#38bdf8',
}: {
  value: string;
  onChange: (t: string) => void;
  accent?: string;
}) {
  const [modalVisible, setModalVisible] = useState(false);
  const { theme } = useTheme();
  const c = colors[theme as 'light' | 'dark'] ?? colors['dark'];

  const parseTime = (v: string) => {
    if (!v) {
      return new Date();
    }
    const parts = v.split(':');
    if (parts.length < 2) return new Date();
    const [hStr, mStr] = parts;
    const d = new Date();
    d.setHours(parseInt(hStr, 10));
    d.setMinutes(parseInt(mStr, 10));
    return d;
  };

  const [date, setDate] = useState(parseTime(value));

  const openModal = () => {
    setDate(parseTime(value));
    setModalVisible(true);
  };

  const confirm = () => {
    onChange(`${pad(date.getHours())}:${pad(date.getMinutes())}`);
    setModalVisible(false);
  };

  const displayTime = () => {
    const p = parseTime(value);
    const h = p.getHours();
    const m = p.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${pad(m)} ${ampm}`;
  };

  return (
    <>
      <TouchableOpacity
        onPress={openModal}
        style={[clockStyles.timeDisplay, { borderColor: c.border, backgroundColor: c.card }]}
        activeOpacity={0.8}
      >
        <Text style={[clockStyles.timeDisplayTxt, { color: c.text }]}>{displayTime()}</Text>
        <Ionicons name="time-outline" size={18} color={accent} />
      </TouchableOpacity>

      {Platform.OS === 'ios' ? (
        <Modal visible={modalVisible} transparent animationType="fade">
          <View style={clockStyles.overlay}>
            <View style={[clockStyles.sheet, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border }]}>
              <View style={{ padding: 20, alignItems: 'center' }}>
                <DateTimePicker
                  value={date}
                  mode="time"
                  display="spinner"
                  themeVariant={theme as any}
                  textColor={c.text}
                  onChange={(e, selected) => {
                    if (selected) setDate(selected);
                  }}
                />
              </View>
              <View style={[clockStyles.actions, { borderTopWidth: 1, borderTopColor: c.border }]}>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={clockStyles.cancelBtn}>
                  <Text style={{ color: c.sub, fontWeight: '700', fontSize: 15 }}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirm} style={clockStyles.okBtn}>
                  <Text style={[clockStyles.okTxt, { color: accent }]}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : (
        modalVisible && (
          <DateTimePicker
            value={date}
            mode="time"
            display="spinner"
            themeVariant={theme as any}
            onChange={(e, selected) => {
              setModalVisible(false);
              if (e.type === 'set' && selected) {
                onChange(`${pad(selected.getHours())}:${pad(selected.getMinutes())}`);
              }
            }}
          />
        )
      )}
    </>
  );
}

const clockStyles = StyleSheet.create({
  timeDisplay: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1.5,
  },
  timeDisplayTxt: { fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  sheet: {
    width: '100%', maxWidth: 340,
    borderRadius: 28, overflow: 'hidden',
  },
  actions: {
    flexDirection: 'row', justifyContent: 'flex-end',
    gap: 8, padding: 16, paddingTop: 8,
  },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  okBtn:     { paddingHorizontal: 16, paddingVertical: 10 },
  okTxt:     { fontWeight: '800', fontSize: 15 },
});
