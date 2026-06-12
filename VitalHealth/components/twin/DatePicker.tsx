// components/twin/DatePicker.tsx
// Custom themed date picker — no OS-native dialogs, fully matches app dark/light theme.
// Renders a beautiful calendar grid inside the app's own Modal + card.

import React, { useState } from 'react';
import {
  Modal, StyleSheet, Text,
  TouchableOpacity, View, FlatList, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { colors as themeColors } from '../../theme/colors';

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const DAY_NAMES = ["S", "M", "T", "W", "T", "F", "S"];

const pad = (n: number) => String(n).padStart(2, '0');

export default function DatePicker({
  value,
  onChange,
  accent = '#38bdf8',
}: {
  value: string; // YYYY-MM-DD
  onChange: (d: string) => void;
  accent?: string;
}) {
  const { theme } = useTheme();
  const c = themeColors[theme as 'light' | 'dark'] ?? themeColors['dark'];

  const parseDate = (val: string): Date => {
    if (!val) return new Date();
    const parts = val.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        return new Date(y, m, d);
      }
    }
    return new Date();
  };

  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => parseDate(value));
  
  // Navigation state (month/year shown in picker)
  const [viewYear, setViewYear] = useState(() => selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => selectedDate.getMonth());

  const openPicker = () => {
    const d = parseDate(value);
    setSelectedDate(d);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setOpen(true);
  };

  const confirm = () => {
    const formatted = `${selectedDate.getFullYear()}-${pad(selectedDate.getMonth() + 1)}-${pad(selectedDate.getDate())}`;
    onChange(formatted);
    setOpen(false);
  };

  const displayDate = () => {
    const d = parseDate(value);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Generate calendar grid
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();

  // Days from previous month for overlap
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
  const gridItems: { day: number; isCurrentMonth: boolean; date: Date }[] = [];

  // Previous month padding
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = prevMonthDays - i;
    const prevMonthDate = new Date(viewMonth === 0 ? viewYear - 1 : viewYear, viewMonth === 0 ? 11 : viewMonth - 1, dayNum);
    gridItems.push({
      day: dayNum,
      isCurrentMonth: false,
      date: prevMonthDate
    });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const curDate = new Date(viewYear, viewMonth, i);
    gridItems.push({
      day: i,
      isCurrentMonth: true,
      date: curDate
    });
  }

  // Next month padding to fill grid (6 rows * 7 days = 42 cells)
  const totalCells = 42;
  const nextMonthPadding = totalCells - gridItems.length;
  for (let i = 1; i <= nextMonthPadding; i++) {
    const nextMonthDate = new Date(viewMonth === 11 ? viewYear + 1 : viewYear, viewMonth === 11 ? 0 : viewMonth + 1, i);
    gridItems.push({
      day: i,
      isCurrentMonth: false,
      date: nextMonthDate
    });
  }

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const isSelected = (date: Date) => {
    return date.getFullYear() === selectedDate.getFullYear() &&
           date.getMonth() === selectedDate.getMonth() &&
           date.getDate() === selectedDate.getDate();
  };

  return (
    <>
      <TouchableOpacity
        onPress={openPicker}
        style={[dp.trigger, { borderColor: c.border, backgroundColor: c.card }]}
        activeOpacity={0.8}
      >
        <Text style={[dp.triggerTxt, { color: c.text }]}>{displayDate()}</Text>
        <Ionicons name="calendar-outline" size={18} color={accent} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={dp.overlay}>
          <View style={[dp.sheet, { backgroundColor: c.card, borderColor: c.border }]}>
            
            {/* Header */}
            <View style={dp.sheetHeader}>
              <View style={dp.navRow}>
                <TouchableOpacity onPress={prevMonth} style={dp.navBtn}>
                  <Ionicons name="chevron-back" size={20} color={c.text} />
                </TouchableOpacity>
                <Text style={[dp.sheetTitle, { color: c.text }]}>
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </Text>
                <TouchableOpacity onPress={nextMonth} style={dp.navBtn}>
                  <Ionicons name="chevron-forward" size={20} color={c.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Weekdays row */}
            <View style={dp.weekdaysRow}>
              {DAY_NAMES.map((name, i) => (
                <Text key={i} style={[dp.weekdayText, { color: c.sub }]}>
                  {name}
                </Text>
              ))}
            </View>

            {/* Days Grid */}
            <View style={dp.grid}>
              <FlatList
                data={gridItems}
                numColumns={7}
                scrollEnabled={false}
                keyExtractor={(item, index) => `${index}`}
                renderItem={({ item }) => {
                  const active = isSelected(item.date);
                  return (
                    <TouchableOpacity
                      onPress={() => setSelectedDate(item.date)}
                      style={[
                        dp.gridCell,
                        active && { backgroundColor: accent }
                      ]}
                    >
                      <Text
                        style={[
                          dp.gridCellText,
                          { color: item.isCurrentMonth ? c.text : c.sub + '80' },
                          active && { color: '#fff', fontWeight: '800' }
                        ]}
                      >
                        {item.day}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>

            {/* Actions */}
            <View style={dp.actions}>
              <TouchableOpacity
                style={[dp.btn, { borderColor: c.border, borderWidth: 1.5 }]}
                onPress={() => setOpen(false)}
              >
                <Text style={[dp.btnTxt, { color: c.sub }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[dp.btn, { backgroundColor: accent }]}
                onPress={confirm}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={[dp.btnTxt, { color: '#fff' }]}>Done</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>
    </>
  );
}

const dp = StyleSheet.create({
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1.5,
    minWidth: 150, justifyContent: 'space-between'
  },
  triggerTxt: { fontSize: 14, fontWeight: '700' },

  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  sheet: {
    width: '100%', maxWidth: 340,
    borderRadius: 28, borderWidth: 1.5,
    overflow: 'hidden', paddingBottom: 4,
  },
  sheetHeader: {
    paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10,
  },
  navRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  navBtn: {
    padding: 6,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700' },

  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  weekdayText: {
    width: 36,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },

  grid: {
    paddingHorizontal: 16,
    height: 240,
  },
  gridCell: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    margin: 1,
  },
  gridCellText: {
    fontSize: 13,
    fontWeight: '500',
  },

  actions: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 20, paddingVertical: 16,
  },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 14,
  },
  btnTxt: { fontSize: 14, fontWeight: '700' },
});
