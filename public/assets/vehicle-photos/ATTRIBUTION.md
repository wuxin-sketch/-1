# 车型图片来源

本目录缓存的是用于本地原型展示的实车照片缩略图，页面运行时不再热链外部图片。原始图片来自 Wikimedia Commons，下载时经图片代理压缩为本地 JPG。

- `honda-crv.jpg`：Wikimedia Commons，https://commons.wikimedia.org/wiki/File:2021_Honda_CR-V_2.4_Black_Edition.jpg
- `toyota-rav4.jpg`：Wikimedia Commons，https://commons.wikimedia.org/wiki/File:2021_Toyota_RAV4_PHV.jpg
- `nissan-xtrail.jpg`：Wikimedia Commons，https://commons.wikimedia.org/wiki/File:Nissan_X-Trail_IV_IMG001.jpg
- `vw-tiguan-l.jpg`：Wikimedia Commons，https://commons.wikimedia.org/wiki/File:Volkswagen_Tiguan_L_Pro_007.jpg
- `buick-envision.jpg`：Wikimedia Commons，https://commons.wikimedia.org/wiki/File:2021_Buick_Envision.jpg
- `honda-breeze.jpg`：Wikimedia Commons，https://commons.wikimedia.org/wiki/File:Honda_Breeze_009.jpg
- `mazda-cx5.jpg`：Wikimedia Commons，https://commons.wikimedia.org/wiki/File:2020-2021_Mazda_CX-5_XD_AWD.jpg
- `skoda-kodiaq.jpg`：Wikimedia Commons，https://commons.wikimedia.org/wiki/File:2021_SKODA_Kodiaq_1.4_Ambition_silver_front_view_in_Brunei.jpg
- `hyundai-santafe.jpg`：Wikimedia Commons，https://commons.wikimedia.org/wiki/File:Hyundai_Santa_Fe_IV_China_001.jpg
- `chevrolet-equinox.jpg`：Wikimedia Commons，https://commons.wikimedia.org/wiki/File:Chevrolet_Equinox_III_facelift_001.jpg
- `fallback.jpg`：暂用 `honda-crv.jpg` 作为未知车型兜底实车图。

## 车型图库补充图

`public/assets/vehicle-gallery` 缓存了弹窗大图中的内饰、中控和细节图。细节图为对应外观图的本地裁切版本；中控图为对应车型内饰图的本地裁切版本，避免跨车型复用通用中控参考图；本田皓影内饰图使用同平台 CR-V 公开内饰图作为可视参考。

- `honda-crv-interior.jpg` / `honda-breeze-interior.jpg`：Wikimedia Commons，https://commons.wikimedia.org/wiki/File:Honda_CR-V_2.0_RS_e-HEV_-_interior_view.jpg
- `toyota-rav4-interior.jpg`：Wikimedia Commons，https://commons.wikimedia.org/wiki/File:The_interior_of_Toyota_RAV4_Adventure_(6AA-AXAN64-ANXVB).jpg
- `nissan-xtrail-interior.jpg`：Wikimedia Commons，https://commons.wikimedia.org/wiki/File:NISSAN_X-TRAIL_ePOWER_(T33)_CHINA_VERSION_INTERIOR.jpg
- `vw-tiguan-l-interior.jpg`：Wikimedia Commons，https://commons.wikimedia.org/wiki/File:Tiguan-fl-2020-innenraum.jpg
- `buick-envision-interior.jpg`：Wikimedia Commons，https://commons.wikimedia.org/wiki/File:2022_Buick_Envision_interior.jpg
- `mazda-cx5-interior.jpg`：Wikimedia Commons，https://commons.wikimedia.org/wiki/File:Mazda_CX-5_25S_L_Package_2WD_(6BA-KF5P)_interior.jpg
- `skoda-kodiaq-interior.jpg`：Wikimedia Commons，https://commons.wikimedia.org/wiki/File:2021_SKODA_Kodiaq_1.4_Ambition_silver_interior_view_in_Brunei.jpg
- `hyundai-santafe-interior.jpg`：Wikimedia Commons，https://commons.wikimedia.org/wiki/File:Dashboard_Hyundai_Santa_Fe.jpg
- `chevrolet-equinox-interior.jpg`：Wikimedia Commons，https://commons.wikimedia.org/wiki/File:Chevrolet_Equinox_2017_CUV_Interior.jpg
- `*-console.jpg`：由同名 `*-interior.jpg` 本地裁切生成，用于保持车型图库四个分类的一致性。
- `shared-console.jpg`：历史通用参考图，Wikimedia Commons，https://commons.wikimedia.org/wiki/File:Car_interior_view_showing_gear_shift_and_remote_on_console_in_modern_vehicle.jpg
- `shared-console-detail.jpg`：Wikimedia Commons，https://commons.wikimedia.org/wiki/File:Gear_Selector_Recessed_-_2014_Jaguar_XJL_Supercharged_(15578942182).jpg

若用于公开发布或商业展示，请替换为品牌方授权图片或按原图许可补全署名。

<!-- GALLERY-AUTOMATION:START -->
## 授权图库自动化入库记录

- `public/assets/vehicle-gallery/honda-crv-exterior.jpg`：精确授权图，Wikimedia Commons，作者 Chanokchon，许可证 CC BY-SA 4.0，来源 https://commons.wikimedia.org/wiki/File:2021_Honda_CR-V_2.4_Black_Edition.jpg
- `public/assets/vehicle-gallery/toyota-rav4-exterior.jpg`：精确授权图，Wikimedia Commons，作者 TTTNIS，许可证 CC0，来源 https://commons.wikimedia.org/wiki/File:2021_Toyota_RAV4_PHV.jpg
- `public/assets/vehicle-gallery/honda-crv-detail.jpg`：精确授权图，Wikimedia Commons，作者 Chanokchon，许可证 CC BY-SA 4.0，来源 https://commons.wikimedia.org/wiki/File:2021_Honda_CR-V_2.4_Black_Edition.jpg，裁切确认 人工确认使用授权来源图的细节区域裁切。
- `public/assets/vehicle-gallery/nissan-xtrail-exterior.jpg`：精确授权图，Wikimedia Commons，作者 Anonymousfox36，许可证 CC BY-SA 4.0，来源 https://commons.wikimedia.org/wiki/File:Nissan_X-Trail_IV_IMG001.jpg
- `public/assets/vehicle-gallery/buick-envision-exterior.jpg`：精确授权图，Wikimedia Commons，作者 MercurySable99，许可证 CC BY-SA 4.0，来源 https://commons.wikimedia.org/wiki/File:2021_Buick_Envision.jpg
- `public/assets/vehicle-gallery/buick-envision-interior.jpg`：精确授权图，Wikimedia Commons，作者 deathpallie325，许可证 CC BY-SA 4.0，来源 https://commons.wikimedia.org/wiki/File:2022_Buick_Envision_interior.jpg
- `public/assets/vehicle-gallery/buick-envision-console.jpg`：精确授权图，Wikimedia Commons，作者 deathpallie325，许可证 CC BY-SA 4.0，来源 https://commons.wikimedia.org/wiki/File:2022_Buick_Envision_interior.jpg，裁切确认 人工确认使用授权内饰图的中控区域裁切。
- `public/assets/vehicle-gallery/buick-envision-detail.jpg`：精确授权图，Wikimedia Commons，作者 MercurySable99，许可证 CC BY-SA 4.0，来源 https://commons.wikimedia.org/wiki/File:2021_Buick_Envision.jpg，裁切确认 人工确认使用授权来源图的细节区域裁切。
- `public/assets/vehicle-gallery/chevrolet-equinox-detail.jpg`：精确授权图，Wikimedia Commons，作者 JustAnotherCarDesigner，许可证 CC BY-SA 4.0，来源 https://commons.wikimedia.org/wiki/File:Chevrolet_Equinox_III_facelift_001.jpg，裁切确认 人工确认使用授权来源图的细节区域裁切。

<!-- GALLERY-AUTOMATION:END -->
