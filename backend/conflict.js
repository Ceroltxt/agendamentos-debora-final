function getTodayIsoLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isReservationOnDate(res, targetIsoDate, targetDayKey) {
  if (!res) return false;
  if (res.isRecurrent) {
    let matchesDay = false;
    if (Array.isArray(res.recurrentDays) && res.recurrentDays.length > 0) {
      matchesDay = res.recurrentDays.includes(targetDayKey);
    } else {
      matchesDay = res.day === targetDayKey;
    }
    if (!matchesDay) return false;
    if (res.date && targetIsoDate && targetIsoDate < res.date) {
      return false;
    }
    return true;
  }
  if (res.date && targetIsoDate) {
    return res.date === targetIsoDate;
  }
  return res.day === targetDayKey;
}

function hasSlotConflict(existingRes, space, period, slotIndex, targetIsoDate, targetDayKey, isNewRecurrent = false) {
  if (!existingRes) return false;
  if (
    existingRes.space !== space ||
    existingRes.period !== period ||
    Number(existingRes.slotIndex) !== Number(slotIndex)
  ) {
    return false;
  }
  if (isNewRecurrent) {
    if (existingRes.isRecurrent) {
      const existingMatchesDay =
        (Array.isArray(existingRes.recurrentDays) && existingRes.recurrentDays.includes(targetDayKey)) ||
        existingRes.day === targetDayKey;
      if (existingMatchesDay) return true;
    } else {
      const minDate = targetIsoDate || getTodayIsoLocal();
      if (existingRes.day === targetDayKey && (!existingRes.date || existingRes.date >= minDate)) {
        return true;
      }
    }
    return false;
  }
  return isReservationOnDate(existingRes, targetIsoDate, targetDayKey);
}

function isSameAuthor(a, b) {
  if (!a || !b) return false;
  if (a.authorId && b.authorId) return a.authorId === b.authorId;
  if (a.authorName && b.authorName) {
    return a.authorName.trim().toLowerCase() === b.authorName.trim().toLowerCase();
  }
  return false;
}

function checkReservationConflict(existingList, candidate) {
  const targetSchool = candidate.schoolId || 'furlan';
  const sameSchoolList = (existingList || []).filter(
    (r) => r && r.id !== candidate.id && (r.schoolId || 'furlan') === targetSchool
  );

  const spaceConflict = sameSchoolList.find((r) =>
    hasSlotConflict(
      r,
      candidate.space,
      candidate.period,
      candidate.slotIndex,
      candidate.date,
      candidate.day,
      Boolean(candidate.isRecurrent)
    )
  );
  if (spaceConflict) {
    return {
      type: 'SPACE_OCCUPIED',
      message: candidate.isRecurrent
        ? 'Este horário já possui uma reserva ou rotina neste dia da semana.'
        : 'Este horário já foi reservado por outro docente.',
      conflictWith: spaceConflict
    };
  }

  const otherSpace = candidate.space === 'Sala Maker' ? 'Biblioteca' : 'Sala Maker';
  const crossConflict = sameSchoolList.find(
    (r) =>
      isSameAuthor(r, candidate) &&
      hasSlotConflict(
        r,
        otherSpace,
        candidate.period,
        candidate.slotIndex,
        candidate.date,
        candidate.day,
        Boolean(candidate.isRecurrent)
      )
  );
  if (crossConflict) {
    return {
      type: 'AUTHOR_CROSS_CONFLICT',
      message: `Você já possui uma reserva na ${otherSpace} neste mesmo horário.`,
      conflictWith: crossConflict
    };
  }

  return null;
}

module.exports = {
  isReservationOnDate,
  hasSlotConflict,
  checkReservationConflict
};
