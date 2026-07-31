# encoding: UTF-8
#
# SlabCutPlanner — експорт зі SketchUp
# ------------------------------------
# Встановлення:
#   Скопіювати цей файл у теку плагінів SketchUp:
#     Windows: C:\Users\<ім'я>\AppData\Roaming\SketchUp\SketchUp 20XX\SketchUp\Plugins\
#     macOS:   ~/Library/Application Support/SketchUp 20XX/SketchUp/Plugins/
#   Перезапустити SketchUp. Меню: Розширення → SlabCutPlanner → Експорт виробу…
#
# Що експортує:
#   Кожна ПЛАСКА панель (група або компонент) → один елемент виробу:
#     контур у 2D (мм), товщина, сторони, положення в просторі.
#
# Конвенція імен груп (з неї беруться тип і сторона прив'язки):
#   Стільниця          → Стільниця        (slot: main)
#   Нога_B / Опора_B   → Опора            (slot: leg_B)
#   Бортик_A           → Бортик           (slot: skirting_A)
#   Панель_A           → Стінова панель   (slot: wall_panel_A)
#   Підворот_C         → Підворот         (slot: fold_C)
#   Потовщення_D       → Потовщення       (slot: thickening_D)
#   інше               → Довільний елемент
#
# Одиниці: SketchUp усередині працює в ДЮЙМАХ і з Z вгору.
#          Ми віддаємо МІЛІМЕТРИ і Y вгору — конвертація тут, один раз.

require 'sketchup.rb'
require 'json'

module SlabCut
  module Exporter

    MM        = 25.4   # дюйм → мм
    FORMAT    = 'slabcut-sketchup'
    VERSION   = 1
    SIDE_IDS  = %w[A B C D E F G H]

    # --- допоміжне -----------------------------------------------------------

    def self.mm(v)
      (v.to_f * MM).round(2)
    end

    # Тип деталі з назви групи
    def self.detect_type(name)
      n = name.to_s.strip
      return 'Стільниця'      if n =~ /^стільниц/i
      return 'Опора'          if n =~ /^(ног|опор)/i
      return 'Бортик'         if n =~ /^бортик/i
      return 'Стінова панель' if n =~ /^(панель|стінов)/i
      return 'Підворот'       if n =~ /^підворот/i
      return 'Потовщення'     if n =~ /^потовщ/i
      'Довільний елемент'
    end

    # Сторона прив'язки з суфікса назви: "Нога_B" → "B"
    def self.detect_side(name)
      m = name.to_s.strip.match(/_([A-Ha-h])\s*$/)
      m ? m[1].upcase : nil
    end

    # Слот у термінах застосунку
    def self.build_slot(type, side, index)
      case type
      when 'Стільниця'      then 'main'
      when 'Опора'          then side ? "leg_#{side}"        : "leg_#{index}"
      when 'Бортик'         then side ? "skirting_#{side}"   : "skirting_#{index}"
      when 'Стінова панель' then side ? "wall_panel_#{side}" : "wall_panel_#{index}"
      when 'Підворот'       then side ? "fold_#{side}"       : "fold_#{index}"
      when 'Потовщення'     then side ? "thickening_#{side}" : "thickening_#{index}"
      else "custom_#{index}"
      end
    end

    # Сутності всередині групи або компонента
    def self.inner_entities(inst)
      if inst.is_a?(Sketchup::ComponentInstance)
        inst.definition.entities
      elsif inst.is_a?(Sketchup::Group)
        inst.entities
      else
        nil
      end
    end

    # --- геометрія -----------------------------------------------------------

    # Найбільша пласка грань — це «лице» панелі
    def self.largest_face(ents)
      faces = ents.grep(Sketchup::Face)
      return nil if faces.empty?
      faces.max_by { |f| f.area }
    end

    # Контур грані у власних 2D-координатах площини (мм) + сторони
    def self.face_contour_2d(face)
      loop_pts = face.outer_loop.vertices.map { |v| v.position }
      return nil if loop_pts.length < 3

      origin = loop_pts[0]
      # локальна вісь X — уздовж першого ребра
      xaxis = (loop_pts[1] - origin)
      return nil if xaxis.length.to_f.abs < 1e-9
      xaxis.normalize!
      normal = face.normal
      yaxis = normal.cross(xaxis)
      yaxis.normalize!

      pts2d = loop_pts.map do |p|
        v = p - origin
        { 'x' => mm(v.dot(xaxis)), 'y' => mm(v.dot(yaxis)) }
      end

      # Нормалізуємо в перший квадрант (0,0 — лівий нижній кут)
      min_x = pts2d.map { |p| p['x'] }.min
      min_y = pts2d.map { |p| p['y'] }.min
      pts2d = pts2d.map { |p| { 'x' => (p['x'] - min_x).round(2), 'y' => (p['y'] - min_y).round(2) } }

      # Сторони: відрізки контуру з довжинами. Потрібні застосунку для кромок —
      # без них «Довільний елемент» падає на габаритний прямокутник.
      sides = []
      cursor = 0.0
      pts2d.each_with_index do |p, i|
        q = pts2d[(i + 1) % pts2d.length]
        len = Math.sqrt((q['x'] - p['x'])**2 + (q['y'] - p['y'])**2).round(2)
        next if len < 0.5 # пропускаємо вироджені відрізки
        sides << {
          'id'   => SIDE_IDS[sides.length] || "S#{sides.length + 1}",
          'from' => cursor.round(2),
          'to'   => (cursor + len).round(2),
          'length' => len
        }
        cursor += len
      end

      { 'contour' => pts2d, 'sides' => sides }
    end

    # Товщина = найменший габарит панелі
    def self.thickness_mm(inst)
      bb = inst.bounds
      dims = [mm(bb.width), mm(bb.height), mm(bb.depth)].sort
      dims.first
    end

    # Положення в нашій системі: SketchUp Z вгору → наш Y вгору
    def self.position3d(inst)
      t = inst.transformation
      o = t.origin
      {
        'x' => mm(o.x),
        'y' => mm(o.z),      # вгору
        'z' => (-mm(o.y)),
        # Осі — авторитетне джерело орієнтації (Ейлерові кути неоднозначні).
        'xaxis' => axis_h(t.xaxis),
        'yaxis' => axis_h(t.zaxis),
        'zaxis' => axis_h(t.yaxis)
      }
    end

    def self.axis_h(v)
      { 'x' => v.x.round(6), 'y' => v.z.round(6), 'z' => (-v.y).round(6) }
    end

    # --- основне -------------------------------------------------------------

    def self.collect(model)
      sel = model.selection.to_a.select { |e| e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance) }
      src = sel.empty? ? model.entities.to_a.select { |e| e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance) } : sel

      elements = []
      skipped  = []

      src.each_with_index do |inst, idx|
        name = inst.name.to_s
        name = inst.definition.name.to_s if name.empty? && inst.respond_to?(:definition)

        ents = inner_entities(inst)
        if ents.nil?
          skipped << "#{name.empty? ? "(без назви ##{idx + 1})" : name}: не група і не компонент"
          next
        end

        face = largest_face(ents)
        if face.nil?
          skipped << "#{name}: не знайдено пласкої грані"
          next
        end

        geo = face_contour_2d(face)
        if geo.nil?
          skipped << "#{name}: не вдалося побудувати контур"
          next
        end

        type = detect_type(name)
        side = detect_side(name)
        slot = build_slot(type, side, idx + 1)
        th   = thickness_mm(inst)

        elements << {
          'slot'       => slot,
          'type'       => type,
          'sourceName' => name,
          'side'       => side,
          'thickness'  => th <= 0 ? 20 : th,
          'contour'    => geo['contour'],
          'sides'      => geo['sides'],
          'position3D' => position3d(inst)
        }
      end

      [elements, skipped]
    end

    def self.run
      model = Sketchup.active_model
      elements, skipped = collect(model)

      if elements.empty?
        UI.messagebox("Нічого не експортовано.\n\n" \
                      "Виділіть групи/компоненти панелей або перевірте, що вони містять пласкі грані.\n\n" \
                      "Пропущено:\n" + (skipped.empty? ? '—' : skipped.join("\n")))
        return
      end

      product_name = model.title.to_s.empty? ? 'Виріб зі SketchUp' : model.title.to_s

      payload = {
        'format'  => FORMAT,
        'version' => VERSION,
        'units'   => 'mm',
        'product' => {
          'name'     => product_name,
          'elements' => elements
        }
      }

      path = UI.savepanel('Зберегти для SlabCutPlanner', '', "#{product_name}.slabcut.json")
      return if path.nil?
      path += '.json' unless path =~ /\.json$/i

      File.open(path, 'w:UTF-8') { |f| f.write(JSON.pretty_generate(payload)) }

      msg  = "Готово.\n\nДеталей експортовано: #{elements.length}\n"
      msg += elements.map { |e| "  • #{e['sourceName']} → #{e['type']} (#{e['slot']}), товщина #{e['thickness']} мм" }.join("\n")
      unless skipped.empty?
        msg += "\n\nПропущено (#{skipped.length}):\n" + skipped.map { |s| "  • #{s}" }.join("\n")
      end
      msg += "\n\nФайл: #{path}"
      UI.messagebox(msg)
    end

    # --- меню ----------------------------------------------------------------

    unless defined?(@menu_loaded)
      menu = UI.menu('Plugins').add_submenu('SlabCutPlanner')
      menu.add_item('Експорт виробу…') { SlabCut::Exporter.run }
      @menu_loaded = true
    end

  end
end
